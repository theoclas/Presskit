import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth-user';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaErrors } from '../media/media.errors';
import { UploadGate, declaredLengthTooLarge, discardRequestBody, readImageUpload } from '../media/upload.interceptor';
import { quotaExceeded } from './profile-media.service';
import { quotaError } from './profile-rules';
import { ProfileStore } from './profile-store.service';

type UploadRequest = AuthedRequest & { scopedProfileId?: ScopedProfileId };

/**
 * POST .../media [me|adm]. Todo lo que se puede decidir sin el archivo se decide ANTES de que
 * multer lea el cuerpo a memoria (hasta 10 MB), en este orden:
 * 1. Content-Length imposible → 413.
 * 2. Cupo en UploadGate (3 en el api, 2 por usuario) → si no hay, 503 UPLOAD_BUSY.
 * 3. Cuota del perfil ya llena → 409 QUOTA_EXCEEDED.
 * En esos rechazos el cuerpo se descarta sin guardarlo (discardRequestBody) antes de responder:
 * si se responde con el cuerpo a medio enviar, el cliente o el nginx de delante ven la conexión
 * cortada en vez del error. El cupo se libera cuando termina el handler (incluido sharp).
 * Corre después de ProfileScopeGuard, que ya fijó el perfil autorizado.
 */
@Injectable()
export class ProfileUploadInterceptor implements NestInterceptor {
  constructor(
    private readonly gate: UploadGate,
    private readonly store: ProfileStore,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<UploadRequest>();
    const res = http.getResponse<Response>();
    const userId = req.user?.id;
    const profileId = req.scopedProfileId;
    const reject = async (err: Error): Promise<never> => {
      await discardRequestBody(req as Request);
      throw err;
    };
    if (!userId || !profileId) return reject(Errors.forbidden());

    if (declaredLengthTooLarge(req)) return reject(MediaErrors.tooLarge());
    const release = this.gate.tryEnter(userId);
    if (!release) return reject(MediaErrors.busy());
    let reading = false;
    try {
      const status = await this.store.status(profileId);
      const usage = await this.store.usage(profileId, status);
      if (quotaError(status, usage, 0, 1)) throw quotaExceeded(status);
      reading = true;
      await readImageUpload(req as Request, res);
    } catch (err) {
      release();
      // Si multer ya empezó, él mismo descarta lo que falta; si no, lo hacemos aquí.
      if (!reading) await discardRequestBody(req as Request);
      throw err;
    }
    return next.handle().pipe(finalize(release));
  }
}
