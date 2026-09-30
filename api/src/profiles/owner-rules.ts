import { LIMITS, type ProfileStatus, type SlugAvailabilityDto, validateSlug } from '@fersua/shared';

// Reglas del lado del dueño (M3) como funciones puras: se prueban sin Nest, BD ni disco.

const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ transiciones del dueño

/**
 * Transiciones que solo hace el dueño y que no están en STATUS_TRANSITIONS de shared (esa
 * tabla también decide los botones del admin, que nunca "retira" un perfil).
 */
export const OWNER_TRANSITIONS = {
  withdraw: { from: ['PENDING_REVIEW'] as readonly ProfileStatus[], to: 'DRAFT' as ProfileStatus },
} as const;

export type OwnerAction = keyof typeof OWNER_TRANSITIONS;

// ------------------------------------------------------------------ enviar a revisión

export type SubmitBlock =
  | { code: 'EMAIL_NOT_VERIFIED' }
  | { code: 'LEGAL_INFO_REQUIRED' }
  | { code: 'PROFILE_INCOMPLETE'; missing: Record<string, string> };

/**
 * Qué impide enviar a revisión (null = se puede), en el orden del contrato (docs/api-m3.md):
 * 1. correo verificado → 403 EMAIL_NOT_VERIFIED;
 * 2. registro legal del art. 53 → 409 LEGAL_INFO_REQUIRED;
 * 3. checklist `publishMissing` vacío → 409 PROFILE_INCOMPLETE con los faltantes.
 * `missing` es la salida de publishChecklist (incluye legalInfo, que aquí se decide antes).
 */
export function submitBlocker(input: { emailVerified: boolean; missing: Record<string, string> }): SubmitBlock | null {
  if (!input.emailVerified) return { code: 'EMAIL_NOT_VERIFIED' };
  if (Object.prototype.hasOwnProperty.call(input.missing, 'legalInfo')) return { code: 'LEGAL_INFO_REQUIRED' };
  const rest = { ...input.missing };
  delete rest.legalInfo;
  if (Object.keys(rest).length) return { code: 'PROFILE_INCOMPLETE', missing: rest };
  return null;
}

// ------------------------------------------------------------------ slug

/**
 * Disponibilidad de un slug ya normalizado. Libre para `ownProfileId` si ya es suyo (su slug
 * actual o una redirección suya: volver a un slug propio anterior está permitido en PUT /slug).
 */
export function slugAvailability(
  slug: string,
  taken: { profileId: string | null; redirectProfileId: string | null },
  ownProfileId: string | null,
): SlugAvailabilityDto {
  const err = validateSlug(slug);
  if (err) return { available: false, reason: err };
  const byOther = (id: string | null) => id !== null && id !== ownProfileId;
  if (byOther(taken.profileId) || byOther(taken.redirectProfileId)) return { available: false, reason: 'TAKEN' };
  return { available: true };
}

// ------------------------------------------------------------------ purgas (H3, M12)

/** Aviso de borrador por vencer (día 21 sin actividad). */
export const DRAFT_WARN_DAYS = LIMITS.retention.draftWarnDays;
/** Borrador sin actividad: se borra el perfil (día 30). */
export const DRAFT_DELETE_DAYS = LIMITS.retention.draftIdleDays;
/** Días que promete el correo de aviso ("se borrará en 9 días"). */
export const DRAFT_NOTICE_DAYS = DRAFT_DELETE_DAYS - DRAFT_WARN_DAYS;
/** Rechazado sin actividad: se borra el perfil. */
export const REJECTED_DELETE_DAYS = LIMITS.retention.rejectedIdleDays;
/** Cuenta con el correo sin verificar: se borra (si no tiene perfil o lo tiene en borrador). */
export const UNVERIFIED_USER_DAYS = LIMITS.retention.unverifiedUserDays;
/** Holgura: el job corre a diario a la misma hora, pero no al mismo milisegundo. */
const NOTICE_SLACK_MS = 12 * 3_600_000;

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export type DraftAction = 'none' | 'warn' | 'wait' | 'delete';

/**
 * Borrador con dueño:
 * - 21 días sin actividad → aviso por correo (una sola vez por racha de inactividad: `warnedAt`
 *   es el último aviso posterior a lastActivityAt).
 * - 30 días → se borra, pero nunca sin el aviso con sus 9 días completos cuando el dueño
 *   puede recibir correo (`canMail`: correo verificado). Si el aviso salió tarde, se espera.
 */
export function draftAction(p: { lastActivityAt: Date; warnedAt: Date | null; canMail: boolean }, now: Date): DraftAction {
  const idle = now.getTime() - p.lastActivityAt.getTime();
  if (idle < DRAFT_WARN_DAYS * DAY_MS) return 'none';
  const warned = p.warnedAt !== null && p.warnedAt.getTime() >= p.lastActivityAt.getTime();
  if (idle < DRAFT_DELETE_DAYS * DAY_MS) return warned || !p.canMail ? 'none' : 'warn';
  if (!p.canMail) return 'delete';
  if (!warned) return 'warn';
  const noticed = now.getTime() - p.warnedAt!.getTime() >= DRAFT_NOTICE_DAYS * DAY_MS - NOTICE_SLACK_MS;
  return noticed ? 'delete' : 'wait';
}

/** Rechazado sin actividad desde hace 30 días (el rechazo mismo cuenta como actividad). */
export function rejectedExpired(p: { status: ProfileStatus; lastActivityAt: Date }, now: Date): boolean {
  return p.status === 'REJECTED' && now.getTime() - p.lastActivityAt.getTime() >= REJECTED_DELETE_DAYS * DAY_MS;
}

export interface UnverifiedCandidate {
  role: 'USER' | 'ADMIN';
  email: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  /** El admin creó o administró la cuenta (auditoría admin.user.*): esas no se purgan. */
  managedByAdmin: boolean;
  profileStatus: ProfileStatus | null;
}

/**
 * Cuenta que se registró sola y no verificó su correo en 14 días. Solo si no tiene perfil o lo
 * tiene en borrador: un perfil enviado, aprobado, rechazado o suspendido no se toca por aquí.
 * Nunca el admin ni las cuentas que el admin creó o administró (pueden no tener correo, o
 * tenerlo sin verificar porque él se lo cambió).
 */
export function unverifiedUserExpired(u: UnverifiedCandidate, now: Date): boolean {
  if (u.role !== 'USER' || u.managedByAdmin) return false;
  if (!u.email || u.emailVerifiedAt) return false;
  if (u.profileStatus !== null && u.profileStatus !== 'DRAFT') return false;
  return now.getTime() - u.createdAt.getTime() >= UNVERIFIED_USER_DAYS * DAY_MS;
}
