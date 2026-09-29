import type { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';

/**
 * Usuario autenticado que el JwtAuthGuard deja en req.user. Rol, estado y perfil se releen
 * de la base de datos en cada petición: nunca se confía en lo que diga el token.
 */
export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  /** Perfil DJ propio (solo USER); null si aún no tiene. */
  profileId: string | null;
  /** Familia de refresh tokens de esta sesión (claim "sid"). */
  sessionFamilyId: string;
}

export type AuthedRequest = Request & { user?: AuthUser };
