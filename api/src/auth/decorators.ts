import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { Errors } from '../common/errors';
import type { AuthedRequest, AuthUser } from './auth-user';

export const ROLES_KEY = 'roles';
/** Roles permitidos (se comparan con el rol leído de la BD). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPasswordChange';
/** Rutas que sí funcionan mientras el usuario debe cambiar su contraseña temporal. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

export const STEP_UP_KEY = 'requireStepUp';
/**
 * Acción destructiva del admin: exige la cabecera X-Step-Up emitida por POST /auth/step-up
 * (contraseña + TOTP recientes, 5 minutos).
 */
export const RequireStepUp = () => SetMetadata(STEP_UP_KEY, true);

/** Usuario autenticado. Lanza 401 si la ruta no pasó por el guard de sesión. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw Errors.unauthorized();
  return req.user;
});
