import type { AdminUserDto } from '@fersua/shared';

// Reglas de presentación de las cuentas de DJ en el admin (sin React, para probarlas solas).

/** La contraseña temporal venció: el DJ ya no puede entrar con ella (el api responde "incorrectos"). */
export function tempPasswordExpired(u: Pick<AdminUserDto, 'mustChangePassword' | 'tempPasswordExpiresAt'>, now = Date.now()): boolean {
  return u.mustChangePassword && !!u.tempPasswordExpiresAt && new Date(u.tempPasswordExpiresAt).getTime() <= now;
}

/**
 * Qué pasa con la página pública al suspender la cuenta. La regla del api: un perfil aprobado
 * solo se ve si no tiene dueño o si la cuenta del dueño está activa.
 */
export function suspendConsequence(u: Pick<AdminUserDto, 'profile'>): string {
  const base = 'No podrá ingresar y se cerrarán sus sesiones.';
  if (u.profile?.status === 'APPROVED') {
    return `${base} Su página pública (/${u.profile.slug}) deja de verse hasta que reactives la cuenta.`;
  }
  return base;
}
