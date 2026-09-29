import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PipeTransform,
  createParamDecorator,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth-user';
import { Errors } from '../common/errors';
import { ID_RE } from './dto/editor.dto';

/**
 * Quién hace el cambio, para auditar. `asAdmin` sale del prefijo de la ruta (lo fija
 * ProfileScopeGuard), nunca del cuerpo. La IP solo se usa para su HMAC.
 */
export interface EditorActor {
  id: string;
  username: string;
  asAdmin: boolean;
  ip: string | null;
  /** HMAC de la IP ya calculado (acciones que llegan desde otro módulo del admin); si está, manda sobre `ip`. */
  ipHash?: string | null;
}

type ActorRequest = AuthedRequest & { actingAsAdmin?: boolean };

/** Actor de las rutas [me|adm] (después de ProfileScopeGuard). */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): EditorActor => {
  const req = ctx.switchToHttp().getRequest<ActorRequest>();
  if (!req.user) throw Errors.unauthorized();
  return { id: req.user.id, username: req.user.username, asAdmin: req.actingAsAdmin === true, ip: req.ip ?? null };
});

/** Actor de /api/admin/profiles (siempre admin: lo garantiza AdminOnlyGuard). */
export const AdminActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): EditorActor => {
  const req = ctx.switchToHttp().getRequest<ActorRequest>();
  if (!req.user) throw Errors.unauthorized();
  if (req.user.role !== 'ADMIN') throw Errors.forbidden();
  return { id: req.user.id, username: req.user.username, asAdmin: true, ip: req.ip ?? null };
});

/** 'profile.<x>' para el dueño; 'admin.profile.<x>' cuando edita el admin. */
export function auditAction(actor: Pick<EditorActor, 'asAdmin'>, what: string): string {
  return `${actor.asAdmin ? 'admin.' : ''}profile.${what}`;
}

/**
 * Segunda barrera del rol ADMIN en /api/admin/profiles (el RolesGuard global ya lo exige con
 * @Roles): si alguien quita ese decorador por error, esto sigue cerrando la puerta.
 */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw Errors.unauthorized();
    if (req.user.role !== 'ADMIN') throw Errors.forbidden();
    return true;
  }
}

/** Id de una fila en la URL. Con forma rara ni se consulta: el mismo 404 que si no existiera. */
@Injectable()
export class ParseIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !ID_RE.test(value)) throw Errors.notFound();
    return value;
  }
}
