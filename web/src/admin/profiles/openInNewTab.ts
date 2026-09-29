import { SLUG_RE } from '@fersua/shared';

/** Abre una ruta propia en otra pestaña sin darle acceso a esta (noopener). */
export function openInNewTab(path: string): void {
  // Solo rutas internas: nunca '//host' ni esquemas.
  if (!path.startsWith('/') || path.startsWith('//')) return;
  window.open(path, '_blank', 'noopener,noreferrer');
}

/** Página pública de un perfil (el slug viene del api, pero se revisa antes de armar la URL). */
export function openPublicPage(slug: string): void {
  if (SLUG_RE.test(slug)) openInNewTab(`/${slug}`);
}
