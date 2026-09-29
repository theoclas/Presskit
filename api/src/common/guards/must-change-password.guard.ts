import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../../auth/auth-user';
import { ALLOW_PENDING_PASSWORD_KEY } from '../../auth/decorators';
import { Errors } from '../errors';

/**
 * Con contraseña temporal pendiente solo funcionan las rutas @AllowPendingPasswordChange
 * (me, change-password, logout, logout-all). Todo lo demás: 403 PASSWORD_CHANGE_REQUIRED.
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.mustChangePassword) return true;
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_PASSWORD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;
    throw Errors.forbidden('PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña temporal antes de continuar.');
  }
}
