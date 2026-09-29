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

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: unknown): input is string {
  return typeof input === 'string' && input.length <= LIMITS.user.emailMax && EMAIL_RE.test(input.trim());
}
