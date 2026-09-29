import type { AuthUser } from '../auth/auth-user';

/** Quién hace la acción, para auditar: id y usuario del admin, y la IP ya como HMAC. */
export interface AdminActor {
  id: string;
  username: string;
  ipHash: string | null;
}

export function toActor(user: AuthUser, ipHash: string | null): AdminActor {
  return { id: user.id, username: user.username, ipHash };
}

/** Campos de auditoría comunes a toda acción del admin. */
export function actorFields(actor: AdminActor): { actorId: string; actorUsername: string; ipHash: string | null } {
  return { actorId: actor.id, actorUsername: actor.username, ipHash: actor.ipHash };
}
