import { LIMITS } from './limits';

// Se guarda en minúscula. 3-24 caracteres: letras, números, '.' y '_' (no al inicio/fin ni dobles).
export const USERNAME_RE = /^(?=.{3,24}$)[a-z0-9](?:[a-z0-9]|[._](?=[a-z0-9]))*$/;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'administrador',
  'root',
  'system',
  'sistema',
  'soporte',
  'support',
  'moderator',
  'moderador',
  'fersua',
  'fersuastudio',
  'noreply',
  'no.reply',
  'api',
  'null',
  'undefined',
]);

export type UsernameError = 'FORMAT' | 'RESERVED';

export function normalizeUsername(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase();
}

/** `allowReserved` solo lo usa la CLI que crea al admin (usuario "Fersua"). */
export function validateUsername(input: unknown, opts: { allowReserved?: boolean } = {}): UsernameError | null {
  if (typeof input !== 'string') return 'FORMAT';
  const u = normalizeUsername(input);
  if (u.length < LIMITS.user.usernameMin || u.length > LIMITS.user.usernameMax) return 'FORMAT';
  if (!USERNAME_RE.test(u)) return 'FORMAT';
  if (!opts.allowReserved && RESERVED_USERNAMES.has(u)) return 'RESERVED';
  return null;
}

/**
 * addr-spec estricto (RFC 5321/5322 sin comillas ni comentarios), solo ASCII:
 * - parte local: dot-atom (letras, números y !#$%&'*+/=?^_`{|}~-, puntos no al inicio, al
 *   final ni dobles), máximo 64;
 * - dominio: etiquetas [A-Za-z0-9-] (sin guion al inicio o al final) separadas por puntos, con
 *   un TLD que empieza por letra.
 * Nunca pasan <>,;:"()[]\ ni espacios: con ellos, "x<otro@buzon.com>" o "a,otro@buzon.com"
 * los entrega el cliente SMTP a OTRO destinatario (evadía "1 correo = 1 cuenta" y los topes).
 */
const EMAIL_LOCAL = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const EMAIL_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const EMAIL_TLD = '[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])';
const EMAIL_RE = new RegExp(`^(?=[^@]{1,64}@)${EMAIL_LOCAL}@(?:${EMAIL_LABEL}\\.)+${EMAIL_TLD}$`);

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: unknown): input is string {
  return typeof input === 'string' && input.length <= LIMITS.user.emailMax && EMAIL_RE.test(input.trim());
}

/**
 * Buzón canónico para topes por destinatario: sin la etiqueta "+algo" de la parte local
 * (dj+1@x.com y dj+2@x.com llegan al mismo buzón) y en minúscula. Solo para contar, nunca
 * para enviar ni para guardar.
 */
export function mailboxKey(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  const local = e.slice(0, at).split('+')[0] || e.slice(0, at);
  return `${local}@${e.slice(at + 1)}`;
}
