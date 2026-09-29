import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { Errors } from '../errors';

/**
 * Id de perfil ya autorizado. Los servicios de edición solo aceptan este tipo, así nadie
 * puede pasar un id sacado del cuerpo o de la query por error.
 */
export type ScopedProfileId = string & { readonly __scoped: unique symbol };

type ScopedRequest = AuthedRequest & { scopedProfileId?: ScopedProfileId; actingAsAdmin?: boolean };

const ADMIN_PREFIX = '/api/admin/profiles/';
const OWNER_PREFIX = '/api/me/profile';

/**
 * Decide sobre qué perfil actúa la petición según el PREFIJO de la ruta, nunca según qué
 * parámetros traiga:
 * - /api/admin/profiles/:profileId/...  → solo ADMIN; el perfil debe existir.
 * - /api/me/profile/...                 → solo USER; su propio perfil (404 NO_PROFILE si no tiene).
 * Los controladores de edición se montan en ambos caminos con este guard.
 */
@Injectable()
export class ProfileScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const user = req.user;
    if (!user) throw Errors.unauthorized();
    const path = (req.originalUrl ?? req.url).split('?')[0] ?? '';

    if (path.startsWith(ADMIN_PREFIX)) {
      if (user.role !== 'ADMIN') throw Errors.forbidden();
      const raw = req.params?.profileId;
      if (typeof raw !== 'string' || !/^[a-z0-9]{20,32}$/.test(raw)) throw Errors.notFound('Perfil no encontrado.');
      const exists = await this.prisma.djProfile.findUnique({ where: { id: raw }, select: { id: true } });
      if (!exists) throw Errors.notFound('Perfil no encontrado.');
      req.scopedProfileId = exists.id as ScopedProfileId;
      req.actingAsAdmin = true;
      return true;
    }

    if (path === OWNER_PREFIX || path.startsWith(`${OWNER_PREFIX}/`)) {
      if (user.role !== 'USER') throw Errors.forbidden();
      if (!user.profileId) throw Errors.notFound('Aún no tienes un perfil DJ.');
      req.scopedProfileId = user.profileId as ScopedProfileId;
      req.actingAsAdmin = false;
      return true;
    }

    // Un controlador con este guard montado en otra ruta es un error de programación.
    throw Errors.forbidden();
  }
}

/** Id del perfil autorizado por ProfileScopeGuard. */
export const ScopedProfile = createParamDecorator((_data: unknown, ctx: ExecutionContext): ScopedProfileId => {
  const req = ctx.switchToHttp().getRequest<ScopedRequest>();
  const id = req.scopedProfileId;
  if (typeof id !== 'string' || !id) throw Errors.forbidden();
  return id;
});

/** true si la petición entró por /api/admin/... (para auditar como edición del admin). */
export const ActingAsAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): boolean => {
  return ctx.switchToHttp().getRequest<ScopedRequest>().actingAsAdmin === true;
});
