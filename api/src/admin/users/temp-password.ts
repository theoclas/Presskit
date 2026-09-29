import { randomInt } from 'node:crypto';
import { LIMITS, validatePassword } from '@fersua/shared';

// Contraseña temporal que el admin le pasa a mano a un DJ (por WhatsApp, en persona...).
// Sin caracteres que se confundan al dictarla o copiarla: 0/O/o, 1/l/I.

export const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const TEMP_PASSWORD_LENGTH = 16;
/** 16 × log2(54) ≈ 92 bits: fuera del alcance de cualquier ataque en línea u offline. */
export const TEMP_PASSWORD_BITS = TEMP_PASSWORD_LENGTH * Math.log2(TEMP_PASSWORD_ALPHABET.length);

/** Índice aleatorio uniforme en [0, max). crypto.randomInt usa el CSPRNG y evita el sesgo del módulo. */
export type RandomIndex = (max: number) => number;

export function generateTemporaryPassword(opts: { username?: string; random?: RandomIndex } = {}): string {
  const random = opts.random ?? ((max: number) => randomInt(max));
  // Se repite en el caso (astronómicamente raro) de que no pase la política de contraseñas
  // que aplicará el login: p. ej. que contenga el nombre de usuario.
  for (let attempt = 0; attempt < 20; attempt++) {
    let out = '';
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_PASSWORD_ALPHABET[random(TEMP_PASSWORD_ALPHABET.length)];
    if (validatePassword(out, { username: opts.username }) === null) return out;
  }
  throw new Error('No se pudo generar una contraseña temporal válida');
}

/** Vence a las 72 h (LIMITS.retention.tempPasswordHours). */
export function temporaryPasswordExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + LIMITS.retention.tempPasswordHours * 60 * 60 * 1000);
}
