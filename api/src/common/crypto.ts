import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';

/** Token aleatorio en base64url (32 bytes = 43 caracteres). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret: string, input: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

/** Comparación en tiempo constante de dos strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Clave de una IP para límites y registros. IPv6 se agrupa por /64: un usuario casero
 * controla un /64 completo, así que contar por dirección individual no sirve.
 */
export function ipKey(ip: string | undefined | null): string {
  const raw = (ip ?? '').replace(/^::ffff:/, '');
  if (!raw) return 'unknown';
  if (isIPv6(raw)) {
    const groups = expandIPv6(raw).split(':');
    return `${groups.slice(0, 4).join(':')}::/64`;
  }
  return raw;
}

function expandIPv6(ip: string): string {
  const [head, tail] = ip.split('::') as [string, string | undefined];
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const missing = 8 - h.length - t.length;
  return [...h, ...Array(Math.max(0, missing)).fill('0'), ...t].map((g) => g.padStart(4, '0')).join(':');
}

/** Las IPs nunca se guardan en claro: HMAC con un secreto del servidor. */
export function ipHash(secret: string, ip: string | undefined | null): string {
  return hmacHex(secret, ipKey(ip));
}

/** AES-256-GCM para secretos que hay que poder leer de nuevo (TOTP del admin). */
export function encryptSecret(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(key: Buffer, payload: string): string {
  const [v, ivB, tagB, encB] = payload.split('.');
  if (v !== 'v1' || !ivB || !tagB || !encB) throw new Error('Formato de secreto inválido');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64url')), decipher.final()]).toString('utf8');
}
