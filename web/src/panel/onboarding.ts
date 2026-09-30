import { LIMITS, normalizeSlug, suggestSlug, validateSlug, type SlugAvailabilityDto } from '@fersua/shared';
import { useEffect, useState } from 'react';
import { SLUG_ERROR_MESSAGES } from '../editor-kit/labels';

// Reglas del onboarding (nombre artístico + dirección), sin React para poder probarlas solas.

export const SLUG_TAKEN_MESSAGE = 'Esa dirección ya la usa otro perfil. Prueba con otra.';

/** Nombre artístico: 2 a 60 caracteres visibles después de recortar. */
export function displayNameProblem(name: string): string | null {
  const len = [...name.trim()].length;
  if (!len) return 'Escribe tu nombre artístico.';
  if (len < LIMITS.profile.displayNameMin) return `Mínimo ${LIMITS.profile.displayNameMin} caracteres.`;
  if (len > LIMITS.profile.displayNameMax) return `Máximo ${LIMITS.profile.displayNameMax} caracteres.`;
  return null;
}

/** Lo que escribe en el campo de la dirección: minúsculas y espacios como guiones. */
export function cleanSlugInput(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '-').slice(0, LIMITS.profile.slugMax + 10);
}

/** Dirección efectiva: la que escribió, o la sugerida a partir del nombre mientras no la toque. */
export function effectiveSlug(name: string, typed: string, touched: boolean): string {
  if (touched) return normalizeSlug(typed);
  return name.trim() ? suggestSlug(name) : '';
}

/** Error local (formato o reservada) antes de preguntar al api. */
export function slugProblem(slug: string): string | null {
  if (!slug) return 'Elige la dirección de tu página.';
  const err = validateSlug(slug);
  return err ? SLUG_ERROR_MESSAGES[err] : null;
}

/** Respuesta de disponibilidad -> mensaje (null si está libre). */
export function availabilityProblem(a: SlugAvailabilityDto): string | null {
  if (a.available) return null;
  if (a.reason === 'TAKEN') return SLUG_TAKEN_MESSAGE;
  if (a.reason === 'RESERVED') return SLUG_ERROR_MESSAGES.RESERVED;
  if (a.reason === 'FORMAT') return SLUG_ERROR_MESSAGES.FORMAT;
  return SLUG_TAKEN_MESSAGE;
}

/** Alternativas cuando la dirección está ocupada (solo las que pasan validateSlug). */
export function slugAlternatives(slug: string): string[] {
  const base = slug.replace(/-(dj|music|oficial)$/, '');
  const out = [`${base}-dj`, `dj-${base}`, `${base}-music`];
  return [...new Set(out)].filter((s) => s !== slug && validateSlug(s) === null).slice(0, 3);
}

/** Valor que se actualiza `ms` después del último cambio (para no preguntar en cada tecla). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
