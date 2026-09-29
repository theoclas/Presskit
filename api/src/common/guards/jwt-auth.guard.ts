import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthedRequest } from '../../auth/auth-user';
import { TokenService } from '../../auth/tokens/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators';
import { Errors } from '../errors';

const sessionExpired = () => Errors.unauthorized('UNAUTHORIZED', 'Tu sesión expiró. Vuelve a iniciar sesión.');

/** Token del header `Authorization: Bearer …`. Nunca de la query ni de cookies. */
export function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return null;
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(h);
  return m ? m[1]! : null;
}

/**
 * Guard global de sesión (salvo @Public). Verifica el access JWT y, en UNA consulta, relee
 * de la BD rol, estado, tokenVersion, perfil y que la familia de refresh (claim sid) siga
 * viva. Así suspender, cerrar sesiones o cambiar la contraseña corta el acceso al instante,
 * sin esperar a que venzan los 15 minutos del token (M11).
 * Las rutas @Public quedan anónimas aunque llegue un token: req.user no se toca.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw = extractBearer(req);
    if (!raw) throw Errors.unauthorized();
    const claims = this.tokens.verifyAccess(raw);
    if (!claims) throw sessionExpired();

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        tokenVersion: true,
        mustChangePassword: true,
        profile: { select: { id: true } },
        // Cabeza viva de la familia: sin revocar, sin reemplazar y dentro de su vida absoluta.
        refreshTokens: {
          where: { familyId: claims.sid, revokedAt: null, replacedAt: null, familyExpiresAt: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== claims.tv || user.refreshTokens.length === 0) {
      throw sessionExpired();
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      profileId: user.role === 'USER' ? (user.profile?.id ?? null) : null,
      sessionFamilyId: claims.sid,
    };
    return true;
  }
}
