import {
  LIMITS,
  PASSWORD_ERROR_MESSAGES,
  foldText,
  normalizePassword,
  validatePassword,
  type PasswordError,
  type UserRole,
} from '@fersua/shared';

// La misma política que aplica el api (validatePassword de shared); aquí solo se muestra.

export function minPasswordLength(role: UserRole): number {
  return role === 'ADMIN' ? LIMITS.user.adminPasswordMin : LIMITS.user.passwordMin;
}

export function passwordErrorMessage(err: PasswordError, min: number): string {
  // El mensaje de shared dice el mínimo general; el admin necesita 12.
  if (err === 'TOO_SHORT') return `Usa al menos ${min} caracteres.`;
  return PASSWORD_ERROR_MESSAGES[err];
}

/** Error de la contraseña nueva en español, o null si cumple la política. */
export function checkNewPassword(pw: string, opts: { username: string; role: UserRole }): string | null {
  const min = minPasswordLength(opts.role);
  const err = validatePassword(pw, { username: opts.username, minLength: min });
  return err ? passwordErrorMessage(err, min) : null;
}

export interface PasswordRule {
  key: 'length' | 'username' | 'strength';
  label: string;
  ok: boolean;
}

/** Pistas en vivo para el formulario (se marcan en verde a medida que se cumplen). */
export function passwordRules(pw: string, opts: { username: string; role: UserRole }): PasswordRule[] {
  const min = minPasswordLength(opts.role);
  const len = [...normalizePassword(pw)].length;
  const folded = foldText(normalizePassword(pw));
  const user = opts.username.length >= 3 ? foldText(opts.username) : '';
  const strengthErr = pw ? validatePassword(pw, { minLength: 1 }) : 'TOO_SIMPLE';
  return [
    { key: 'length', label: `Al menos ${min} caracteres`, ok: len >= min && len <= LIMITS.user.passwordMax },
    { key: 'username', label: 'No contiene tu nombre de usuario', ok: pw.length > 0 && (!user || !folded.includes(user)) },
    {
      key: 'strength',
      label: 'No es una contraseña común ni demasiado simple',
      ok: strengthErr !== 'TOO_COMMON' && strengthErr !== 'TOO_SIMPLE',
    },
  ];
}
