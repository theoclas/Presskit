import { createHmac, randomBytes } from 'node:crypto';
import { authenticator as baseAuthenticator } from 'otplib';
import { hmacHex, safeEqual } from '../../common/crypto';
import { ISSUER_LABEL } from '../auth.constants';

// Funciones puras del TOTP del admin y de sus códigos de recuperación. Las usan el api
// (MfaService) y la CLI (admin:create, admin:reset-mfa), así que no dependen de Nest.

/** Ventana 1: acepta el código anterior, el actual y el siguiente (±30 s de desfase de reloj). */
const authenticator = baseAuthenticator.clone({ window: 1 });
const STEP_MS = 30_000;

/** Secreto base32 de 20 bytes (160 bits, lo que recomienda RFC 4226). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function totpKeyUri(username: string, secret: string): string {
  return authenticator.keyuri(username, ISSUER_LABEL, secret);
}

/** Código actual (para pruebas y para la CLI en modo automático). */
export function currentTotp(secret: string): string {
  return authenticator.generate(secret);
}

/**
 * Paso de tiempo absoluto del código si es válido (para impedir reusarlo), o null.
 * El paso es floor(t / 30 s) más el desfase que otplib encontró (−1, 0 o +1).
 */
export function totpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const delta = authenticator.checkDelta(code, secret);
    return delta === null ? null : Math.floor(now / STEP_MS) + delta;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ códigos de recuperación

/** 32 símbolos sin I, O, 0 ni 1 (se confunden al copiarlos a mano). 8 símbolos = 40 bits. */
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RC_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const RECOVERY_CODE_COUNT = 10;

/** 10 códigos XXXX-XXXX. Se muestran una sola vez; en la BD solo queda su HMAC. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const bytes = randomBytes(8);
    let s = '';
    // 256 es múltiplo de 32: tomar 5 bits por byte no sesga ningún símbolo.
    for (const b of bytes) s += RC_ALPHABET[b & 31];
    codes.add(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return [...codes];
}

/** Forma canónica (mayúsculas, sin guion ni espacios) o null si no tiene la forma. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  return RC_RE.test(s) ? s : null;
}

/**
 * Clave para el HMAC de los códigos, derivada de MFA_ENC_KEY. Con 40 bits por código un
 * SHA-256 simple se rompería offline si se filtra la BD; con HMAC hace falta además la clave.
 */
export function recoveryKey(mfaEncKey: Buffer): string {
  return createHmac('sha256', mfaEncKey).update('fersua:mfa:recovery-codes').digest('hex');
}

export function hashRecoveryCode(key: string, code: string): string | null {
  const norm = normalizeRecoveryCode(code);
  return norm ? hmacHex(key, norm) : null;
}

export function hashRecoveryCodes(key: string, codes: string[]): string[] {
  return codes.map((c) => hashRecoveryCode(key, c)).filter((h): h is string => h !== null);
}

/** Lista guardada en User.mfaRecoveryCodes (JSON), tolerante a basura. */
export function parseStoredRecoveryHashes(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((h): h is string => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h));
}

/** Busca el código entre los hashes guardados y devuelve la lista sin él, o null si no está. */
export function consumeRecoveryCode(key: string, stored: unknown, code: string): string[] | null {
  const hash = hashRecoveryCode(key, code);
  if (!hash) return null;
  const list = parseStoredRecoveryHashes(stored);
  let found = -1;
  // Recorre toda la lista (sin salir antes) para no filtrar por tiempo la posición.
  list.forEach((h, i) => {
    if (safeEqual(h, hash) && found === -1) found = i;
  });
  if (found === -1) return null;
  return list.filter((_, i) => i !== found);
}
