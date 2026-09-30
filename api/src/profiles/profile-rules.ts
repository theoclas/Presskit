import {
  LIMITS,
  SOCIAL_PLATFORM_KEYS,
  STATUS_TRANSITIONS,
  canTransition,
  daysBetween,
  isValidDateOnly,
  normalizeDocNumber,
  normalizeSocialUrl,
  resolveFormFields,
  resolveTexts,
  validateFormConfig,
  validateSlug,
  type MediaUsageDto,
  type ProfileStatus,
  type ProfileStatusAction,
  type SocialPlatform,
} from '@fersua/shared';
import type { FieldCheck } from './field-check';

// Reglas de negocio del editor como funciones puras: se prueban sin Nest, BD ni disco.

// ------------------------------------------------------------------ redes

export interface LinkInput {
  platform: SocialPlatform;
  url: string;
  label?: string | null;
}

export interface CleanLink {
  platform: SocialPlatform;
  url: string;
  label: string | null;
}

/** Cuántos enlaces de la misma red se permiten: uno por red, salvo sitio web (2). */
export function perPlatformMax(platform: SocialPlatform): number {
  return platform === 'WEBSITE' ? 2 : 1;
}

/**
 * Normaliza una lista de redes (perfil o integrante): URL https con host permitido
 * (normalizeSocialUrl), una por red salvo WEBSITE (2), sin URLs repetidas. Los errores quedan
 * en `check` con claves como `links[2].url`; los valores nunca.
 */
export function normalizeLinks(input: readonly LinkInput[], max: number, check: FieldCheck, field = 'links'): CleanLink[] {
  if (input.length > max) check.fail(field, 'TOO_MANY');
  const perPlatform = new Map<SocialPlatform, number>();
  const seenUrls = new Set<string>();
  const out: CleanLink[] = [];
  input.slice(0, max).forEach((link, i) => {
    const key = `${field}[${i}]`;
    if (!(SOCIAL_PLATFORM_KEYS as readonly string[]).includes(link.platform)) {
      check.fail(`${key}.platform`, 'INVALID');
      return;
    }
    const r = normalizeSocialUrl(link.platform, typeof link.url === 'string' ? link.url : '');
    if (!r.ok) {
      check.fail(`${key}.url`, r.error);
      return;
    }
    const count = (perPlatform.get(link.platform) ?? 0) + 1;
    perPlatform.set(link.platform, count);
    if (count > perPlatformMax(link.platform)) {
      check.fail(`${key}.platform`, 'DUPLICATE_PLATFORM');
      return;
    }
    if (seenUrls.has(r.url)) {
      check.fail(`${key}.url`, 'DUPLICATE_URL');
      return;
    }
    seenUrls.add(r.url);
    out.push({ platform: link.platform, url: r.url, label: check.optText(`${key}.label`, link.label, LIMITS.social.labelMax) });
  });
  return out;
}

// ------------------------------------------------------------------ fechas

export type EventDateError = 'INVALID' | 'PAST' | 'TOO_FAR' | 'TOO_OLD';

/** El admin puede cargar fechas pasadas (archivo), pero no más de 10 años atrás. */
export const ADMIN_PAST_DAYS_MAX = 3650;

/**
 * Fecha de un evento: de hoy (Bogotá) a hoy + 730 días. El admin además puede poner fechas
 * pasadas (para cargar el archivo de un DJ), hasta 10 años atrás.
 */
export function checkEventDate(date: unknown, today: string, asAdmin: boolean): EventDateError | null {
  if (!isValidDateOnly(date)) return 'INVALID';
  const diff = daysBetween(today, date);
  if (diff > LIMITS.events.maxDaysAhead) return 'TOO_FAR';
  if (diff < 0 && !asAdmin) return 'PAST';
  if (diff < -ADMIN_PAST_DAYS_MAX) return 'TOO_OLD';
  return null;
}

export const START_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ------------------------------------------------------------------ slug

/**
 * Hasta cuándo el dueño NO puede cambiar el slug (null = puede ahora). Solo aplica a perfiles
 * APPROVED: antes de aprobarse la dirección no es pública y cambiarla no rompe enlaces.
 * El admin no tiene límite.
 */
export function slugCooldownUntil(
  profile: { status: ProfileStatus; slugChangedAt: Date | null },
  asAdmin: boolean,
  now: Date,
): Date | null {
  if (asAdmin || profile.status !== 'APPROVED' || !profile.slugChangedAt) return null;
  const until = new Date(profile.slugChangedAt.getTime() + LIMITS.profile.slugChangeCooldownDays * 86_400_000);
  return until > now ? until : null;
}

/**
 * Un perfil que ya estuvo publicado conserva sus slugs viejos como redirección 301: hay enlaces
 * a ellos. Uno que nunca se publicó (borrador, en revisión o rechazado sin haber sido aprobado)
 * no: su slug viejo se libera para que un borrador no acapare nombres (L7).
 */
export function keepsRedirects(p: { status: ProfileStatus; approvedAt: Date | null }): boolean {
  return p.approvedAt !== null || p.status === 'APPROVED' || p.status === 'SUSPENDED';
}

/** Slugs viejos a borrar para no pasar de maxSlugRedirects (se conservan los más nuevos). */
export function redirectsToEvict(redirects: readonly { fromSlug: string; createdAt: Date }[], max = LIMITS.profile.maxSlugRedirects): string[] {
  return [...redirects]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(max)
    .map((r) => r.fromSlug);
}

// ------------------------------------------------------------------ estado

// La tabla de transiciones vive en @fersua/shared: el admin de la web muestra los mismos botones
// que el api acepta. Se reexporta con el nombre que usan los servicios.
export type StatusAction = ProfileStatusAction;
export { STATUS_TRANSITIONS, canTransition };

/** La media es pública si y solo si el perfil queda APPROVED. */
export function mediaPublicFor(status: ProfileStatus): boolean {
  return status === 'APPROVED';
}

// ------------------------------------------------------------------ cuota

export function quotaFor(status: ProfileStatus): { assets: number; bytes: number } {
  return status === 'APPROVED' ? LIMITS.upload.quotaApproved : LIMITS.upload.quotaUnapproved;
}

export function usageDto(status: ProfileStatus, assets: number, bytes: number): MediaUsageDto {
  const q = quotaFor(status);
  return { assets, bytes, maxAssets: q.assets, maxBytes: q.bytes };
}

/** null si cabe; si no, por qué no. `incomingBytes` = 0 para el chequeo previo a procesar. */
export function quotaError(
  status: ProfileStatus,
  current: { assets: number; bytes: number },
  incomingBytes: number,
  incomingAssets: number,
): 'ASSETS' | 'BYTES' | null {
  const q = quotaFor(status);
  if (current.assets + incomingAssets > q.assets) return 'ASSETS';
  if (current.bytes + incomingBytes > q.bytes) return 'BYTES';
  return null;
}

// ------------------------------------------------------------------ enviar a revisión

export interface ChecklistInput {
  displayName: string;
  slug: string;
  texts: unknown;
  /**
   * Perfil con dueño (DJ): el título de la portada tiene que ser suyo, no el de la plantilla
   * ("Electronic club show"). Los perfiles del admin, sin dueño, pueden usar el de la plantilla.
   */
  ownHeroTitleRequired?: boolean;
  heroImageId: string | null;
  activeGenres: number;
  members: number;
  whatsappNumber: string | null;
  bookingForm: unknown;
  hasLegalInfo: boolean;
}

/**
 * PUBLISH_CHECKLIST (docs/diseno/01-modelo-datos.md) + registro legal (art. 53). Devuelve
 * los ítems que faltan como { item: 'REQUIRED' | 'INVALID' }; vacío = listo para enviar.
 */
export function publishChecklist(p: ChecklistInput): Record<string, string> {
  const missing: Record<string, string> = {};
  if (!p.displayName.trim()) missing.displayName = 'REQUIRED';
  if (validateSlug(p.slug)) missing.slug = 'INVALID';
  const heroTitle = p.ownHeroTitleRequired ? ownText(p.texts, 'heroTitle') : resolveTexts(p.texts, p.displayName).heroTitle;
  if (!heroTitle.trim()) missing['texts.heroTitle'] = 'REQUIRED';
  if (!p.heroImageId) missing.heroImage = 'REQUIRED';
  if (p.activeGenres < LIMITS.genres.perProfileMin) missing.genres = 'REQUIRED';
  if (p.members < 1) missing.members = 'REQUIRED';
  if (validateFormConfig(p.bookingForm).errors.length) missing.bookingForm = 'INVALID';
  const formContact = resolveFormFields(p.bookingForm).some((f) => (f.key === 'email1' || f.key === 'phone1') && f.required);
  if (!p.whatsappNumber && !formContact) missing.contact = 'REQUIRED';
  if (!p.hasLegalInfo) missing.legalInfo = 'REQUIRED';
  return missing;
}

/** Texto guardado por el DJ para una ranura ('' si usa el de la plantilla). */
function ownText(texts: unknown, key: string): string {
  if (!texts || typeof texts !== 'object') return '';
  const v = (texts as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

// ------------------------------------------------------------------ registro legal

// La regla del número de documento es compartida con la web (aviso antes de enviar).
export { normalizeDocNumber };
