import type { UserRole } from '@prisma/client';

// Reglas puras sobre a quién puede tocar el admin. Se prueban sin BD.

export type TargetError = 'CANNOT_TARGET_SELF' | 'CANNOT_TARGET_ADMIN';

export const TARGET_ERROR_MESSAGES: Record<TargetError, string> = {
  CANNOT_TARGET_SELF: 'No puedes hacer esto sobre tu propia cuenta.',
  CANNOT_TARGET_ADMIN: 'La cuenta del administrador solo se gestiona desde la consola del servidor.',
};

/**
 * El admin nunca actúa sobre sí mismo (suspenderse o borrarse lo dejaría sin acceso) ni sobre
 * otra cuenta ADMIN: la cuenta del admin se recupera solo por la CLI del VPS (H7).
 * Ninguna acción del admin cambia roles.
 */
export function targetError(actorId: string, target: { id: string; role: UserRole }): TargetError | null {
  if (target.id === actorId) return 'CANNOT_TARGET_SELF';
  if (target.role !== 'USER') return 'CANNOT_TARGET_ADMIN';
  return null;
}

/** El borrado se confirma escribiendo el usuario tal cual se guarda (minúscula). */
export function confirmMatches(confirm: string, username: string): boolean {
  return confirm.normalize('NFKC').trim().toLowerCase() === username;
}
