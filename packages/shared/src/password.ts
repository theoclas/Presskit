import { LIMITS } from './limits';
import { foldText } from './sanitize';

// Contraseñas más usadas (en inglés y español). La regla de longitud mínima ya descarta
// casi todas; esta lista atrapa las largas pero obvias.
const COMMON = new Set([
  '1234567890', '12345678910', '123456789a', 'qwertyuiop', 'password1', 'password12', 'password123',
  'contrasena', 'contrasena1', 'contrasena123', 'contraseña', 'contraseña1', 'contraseña123',
  'iloveyou12', '1q2w3e4r5t', 'q1w2e3r4t5', 'qwerty1234', 'qwerty12345', 'asdfghjkl1', 'zxcvbnm123',
  '1111111111', '0000000000', '9876543210', 'abcdefghij', 'abc1234567', 'aaaaaaaaaa', 'colombia123',
  'colombia2024', 'colombia2025', 'colombia2026', 'medellin123', 'bogota1234', 'teamo12345', 'teamomucho',
  'superman123', 'batman1234', 'football12', 'futbol1234', 'nacional123', 'millonarios', 'america123',
  'welcome123', 'bienvenido', 'bienvenido1', 'administrador', 'admin12345', 'fersua1234', 'fersuastudio',
  'booking123', 'djbooking1', 'musica1234', 'techno1234', 'house12345',
]);

export type PasswordError = 'TOO_SHORT' | 'TOO_LONG' | 'CONTAINS_USERNAME' | 'TOO_COMMON' | 'TOO_SIMPLE';

export interface PasswordCheckOptions {
  username?: string;
  minLength?: number;
}

export function normalizePassword(pw: string): string {
  return pw.normalize('NFKC');
}

export function validatePassword(input: unknown, opts: PasswordCheckOptions = {}): PasswordError | null {
  if (typeof input !== 'string') return 'TOO_SHORT';
  const pw = normalizePassword(input);
  const min = opts.minLength ?? LIMITS.user.passwordMin;
  if ([...pw].length < min) return 'TOO_SHORT';
  if ([...pw].length > LIMITS.user.passwordMax) return 'TOO_LONG';
  const folded = foldText(pw);
  if (opts.username && opts.username.length >= 3 && folded.includes(foldText(opts.username))) {
    return 'CONTAINS_USERNAME';
  }
  if (COMMON.has(folded) || COMMON.has(pw.toLowerCase())) return 'TOO_COMMON';
  // Un solo carácter repetido o una sola clase muy corta.
  if (new Set(pw).size < 4) return 'TOO_SIMPLE';
  return null;
}

export const PASSWORD_ERROR_MESSAGES: Record<PasswordError, string> = {
  TOO_SHORT: `Usa al menos ${LIMITS.user.passwordMin} caracteres.`,
  TOO_LONG: `Máximo ${LIMITS.user.passwordMax} caracteres.`,
  CONTAINS_USERNAME: 'No puede contener tu nombre de usuario.',
  TOO_COMMON: 'Es una contraseña muy común. Elige otra.',
  TOO_SIMPLE: 'Es demasiado simple. Combina más caracteres distintos.',
};
