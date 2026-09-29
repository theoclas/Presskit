import type { ProfileStatus } from './enums';

// Ciclo de vida de un perfil. El api decide con esta tabla (409 INVALID_TRANSITION si no
// cabe) y el admin la usa para mostrar solo los botones posibles: una sola fuente.

export const PROFILE_STATUS_ACTIONS = ['submit', 'approve', 'reject', 'suspend', 'reinstate'] as const;
export type ProfileStatusAction = (typeof PROFILE_STATUS_ACTIONS)[number];

/**
 * Transiciones permitidas. Todo lo demás es 409 INVALID_TRANSITION.
 * - approve también desde DRAFT: en M2 el admin crea y arma el perfil él mismo, sin envío.
 * - suspend solo desde APPROVED: reinstate lo devuelve a APPROVED sin pedir el registro
 *   legal, así que suspender un borrador sería una forma de aprobarlo sin revisión.
 */
export const STATUS_TRANSITIONS: Record<ProfileStatusAction, { from: readonly ProfileStatus[]; to: ProfileStatus }> = {
  submit: { from: ['DRAFT', 'REJECTED'], to: 'PENDING_REVIEW' },
  approve: { from: ['DRAFT', 'PENDING_REVIEW', 'REJECTED'], to: 'APPROVED' },
  reject: { from: ['PENDING_REVIEW'], to: 'REJECTED' },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED' },
  reinstate: { from: ['SUSPENDED'], to: 'APPROVED' },
};

export function canTransition(action: ProfileStatusAction, from: ProfileStatus): boolean {
  return STATUS_TRANSITIONS[action].from.includes(from);
}
