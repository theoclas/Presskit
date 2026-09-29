import { LIMITS, cleanText, isWellFormedText } from '@fersua/shared';

// Reglas puras del catálogo de géneros.

export const GENRE_NAME_MIN = LIMITS.genres.nameMin;
const GENRE_SLUG_MAX = 40;

export type GenreNameError = 'REQUIRED' | 'TOO_SHORT' | 'TOO_LONG' | 'INVALID';

/** Nombre limpio (una línea, sin invisibles) o el error. */
export function cleanGenreName(raw: string): { value: string; error: GenreNameError | null } {
  if (!isWellFormedText(raw)) return { value: '', error: 'INVALID' };
  const value = cleanText(raw);
  if (!value) return { value, error: 'REQUIRED' };
  const len = [...value].length;
  if (len < GENRE_NAME_MIN) return { value, error: 'TOO_SHORT' };
  if (len > LIMITS.genres.nameMax) return { value, error: 'TOO_LONG' };
  // Tiene que dar un slug (al menos una letra o número latino): "🎧🎧" no sirve de filtro.
  if (!genreSlugBase(value)) return { value, error: 'INVALID' };
  return { value, error: null };
}

/**
 * Slug de un género, como suggestSlug pero sin el sufijo '-dj' y con '&' como separador
 * (igual que el catálogo inicial: 'Jackin & Funky' → 'jackin-funky'). Puede quedar vacío.
 */
export function genreSlugBase(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, GENRE_SLUG_MAX)
    .replace(/-+$/g, '');
}

/** Primer slug libre: base, base-2, base-3… sin pasar de 40 caracteres. */
export function uniqueGenreSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, GENRE_SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Sin slug libre para el género');
}
