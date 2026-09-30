import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../auth/auth-user';
import { isTermsOutdated } from '../../auth/terms';
import { PrismaService } from '../../prisma/prisma.service';
import { Errors } from '../errors';
import { matchedPath, roleForPath } from './roles.guard';

/**
 * Re-aceptación de los documentos legales (M3, docs/api-m3.md). Va después de
 * MustChangePasswordGuard: un USER cuya versión aceptada de los Términos para Artistas o de la
 * Política de Datos no es la vigente (o que nunca aceptó, p. ej. cuenta creada por el admin)
 * recibe 403 TERMS_ACCEPTANCE_REQUIRED en todo /api/me/**. /api/auth/* (me, accept-terms,
 * logout…) queda fuera por la ruta. El admin nunca pasa por aquí.
 * Las versiones se releen de la BD en cada petición, como el rol en JwtAuthGuard.
 */
@Injectable()
export class TermsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user || user.role !== 'USER') return true;
    if (roleForPath(matchedPath(req)) !== 'USER') return true;
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, termsVersion: true, privacyVersion: true },
    });
    if (!row) throw Errors.unauthorized();
    if (isTermsOutdated(row)) {
      throw Errors.forbidden(
        'TERMS_ACCEPTANCE_REQUIRED',
        'Actualizamos los Términos para Artistas o la Política de Tratamiento de Datos. Acéptalos para continuar.',
      );
    }
    return true;
  }
}
