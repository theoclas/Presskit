import { useLocation, useParams } from 'react-router';

/**
 * Parte fija de la URL de una ruta con `*` (sin la parte que atrapa el comodín).
 * En '/admin/djs/abc/fotos' con la ruta 'djs/*' → '/admin/djs'; con ':id/*' → '/admin/djs/abc'.
 * Se usa en vez de rutas relativas, que dentro de un `*` se resuelven desde la URL completa.
 */
export function useSplatBase(): string {
  const { pathname } = useLocation();
  const splat = useParams()['*'] ?? '';
  const trimmed = pathname.replace(/\/+$/, '');
  if (!splat) return trimmed;
  const encoded = splat.split('/').map(encodeURIComponent).join('/');
  const tail = trimmed.endsWith(`/${splat}`) ? splat : trimmed.endsWith(`/${encoded}`) ? encoded : null;
  return tail === null ? trimmed : trimmed.slice(0, trimmed.length - tail.length - 1);
}
