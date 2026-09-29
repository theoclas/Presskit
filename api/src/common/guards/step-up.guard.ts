import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STEP_UP_HEADER } from '../../auth/auth.constants';
import type { AuthedRequest } from '../../auth/auth-user';
import { STEP_UP_KEY } from '../../auth/decorators';
import { TokenService } from '../../auth/tokens/token.service';
import { Errors } from '../errors';

/**
 * Acciones destructivas del admin (@RequireStepUp): exige la cabecera X-Step-Up con el token
 * de POST /auth/step-up (contraseña + TOTP de hace menos de 5 min), del mismo usuario y de
 * la misma sesión. Es global y solo actúa donde está la metadata.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<boolean | undefined>(STEP_UP_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw Errors.unauthorized();
    const header = req.headers[STEP_UP_HEADER];
    const ok = typeof header === 'string' && this.tokens.verifyStepUp(header, { sub: user.id, sid: user.sessionFamilyId });
    if (!ok) throw Errors.forbidden('STEP_UP_REQUIRED', 'Confirma tu contraseña y tu código para hacer esta acción.');
    return true;
  }
}
