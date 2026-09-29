import { APP_TOP_LEVEL_ROUTES } from '@fersua/shared';

// Qué hacer con la ruta que el edge pide renderizar. Es una función pura: la parte que
// consulta la BD vive en ShellService. Nunca se arma un Location con texto crudo de la ruta.

export const SHELL_PATH_MAX = 300;

/** Un segmento, opcionalmente con .html y barra final. Sin puntos ni barras dentro: no hay //evil.com. */
const SEGMENT_RE = /^\/([A-Za-z0-9-]{1,60})(\.html)?(\/?)$/;
/** Rutas de la SPA con subrutas (/panel/…, /admin/…, /_preview). */
const APP_PATH_RE = /^\/([A-Za-z0-9_-]{1,40})(\/[A-Za-z0-9_-]{1,60}){0,6}\/?$/;
const SAFE_SLUG_RE = /^[a-z0-9-]{1,60}$/;

export const APP_ROUTES: ReadonlySet<string> = new Set<string>(APP_TOP_LEVEL_ROUTES);

export type ShellPathDecision =
  | { kind: 'index' }
  | { kind: 'redirect'; location: string }
  /** slug en minúscula y sin .html; canonical=false significa que hay que redirigir. */
  | { kind: 'segment'; slug: string; canonical: boolean }
  | { kind: 'app' }
  | { kind: 'notFound' };

/** Location relativo y seguro: siempre '/' + un slug de [a-z0-9-]. Si no cumple, es un bug. */
export function slugLocation(slug: string): string {
  if (!SAFE_SLUG_RE.test(slug)) throw new Error('Slug inseguro para redirección');
  return `/${slug}`;
}

export function decideShellPath(raw: unknown): ShellPathDecision {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > SHELL_PATH_MAX || raw[0] !== '/') {
    return { kind: 'notFound' };
  }
  if (raw === '/') return { kind: 'index' };
  if (/^\/index\.html$/i.test(raw)) return { kind: 'redirect', location: '/' };

  const seg = SEGMENT_RE.exec(raw);
  if (seg) {
    const original = seg[1]!;
    const slug = original.toLowerCase();
    const canonical = slug === original && !seg[2] && !seg[3];
    return { kind: 'segment', slug, canonical };
  }

  const app = APP_PATH_RE.exec(raw);
  if (app && APP_ROUTES.has(app[1]!)) return { kind: 'app' };

  return { kind: 'notFound' };
}
