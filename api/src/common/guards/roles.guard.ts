import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { AuthedRequest } from '../../auth/auth-user';
import { ROLES_KEY } from '../../auth/decorators';
import { Errors } from '../errors';

/** Rol exigido por el prefijo de la ruta, además de lo que diga @Roles. */
export function roleForPath(path: string): UserRole | null {
  const p = path.toLowerCase();
  if (p === '/api/admin' || p.startsWith('/api/admin/')) return 'ADMIN';
  if (p === '/api/me' || p.startsWith('/api/me/')) return 'USER';
  return null;
}

/** Patrón de ruta que casó (no controlado por el cliente); si no está, la URL sin query. */
export function matchedPath(req: AuthedRequest): string {
  const routePath = (req as AuthedRequest & { route?: { path?: unknown } }).route?.path;
  if (typeof routePath === 'string' && routePath.startsWith('/')) return routePath;
  return (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
}

/**
 * Roles leídos de la BD (req.user viene del JwtAuthGuard, nunca del token).
 * - @Roles(...) en el handler o el controlador.
 * - Defensa en profundidad por prefijo: /api/admin/** solo ADMIN y /api/me/** solo USER,
 *   aunque a una ruta nueva se le olvide el @Roles o quede marcada @Public por error.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;

    const byPath = roleForPath(matchedPath(req));
    if (byPath) {
      if (!user) throw Errors.unauthorized();
      if (user.role !== byPath) throw Errors.forbidden();
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && roles.length) {
      if (!user) throw Errors.unauthorized();
      if (!roles.includes(user.role)) throw Errors.forbidden();
    }
    return true;
  }
}
