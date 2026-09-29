import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth-user';
import { Errors } from '../common/errors';

/**
 * Segunda cerradura de /api/admin/*, además de @Roles('ADMIN') y el RolesGuard global.
 * Si por un error de configuración el guard global no corriera (o una ruta nueva quedara
 * marcada @Public), esto sigue exigiendo un usuario ADMIN activo leído de la BD por JwtAuth.
 */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw Errors.unauthorized();
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE') throw Errors.forbidden();
    return true;
  }
}
