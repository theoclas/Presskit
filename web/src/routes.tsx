import { APP_TOP_LEVEL_ROUTES } from '@fersua/shared';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { PublicFallback, PublicLayout } from './public/layouts/PublicLayout';
import { ComingSoonPage } from './public/pages/ComingSoonPage';
import { ErrorPage } from './public/pages/ErrorPage';
import { DjPage } from './public/pages/DjPage';
import { IndexPage } from './public/pages/IndexPage';
import { NotFoundPage } from './public/pages/NotFoundPage';

type TopLevel = (typeof APP_TOP_LEVEL_ROUTES)[number];
type LazyPage = () => Promise<{ Component: ComponentType }>;

// Las páginas legales van en su propio chunk (texto largo que no necesita la página del DJ).
const legal = (pick: (m: typeof import('./public/legal/LegalPages')) => ComponentType): LazyPage => () =>
  import('./public/legal/LegalPages').then((m) => ({ Component: pick(m) }));

/**
 * Una entrada por cada ruta de APP_TOP_LEVEL_ROUTES (el Record obliga a cubrirlas todas).
 * Ingreso, registro, panel y admin llegan en M2/M3: por ahora muestran "Próximamente".
 */
const TOP_LEVEL: Record<TopLevel, { lazy?: LazyPage; Component?: ComponentType; splat?: boolean }> = {
  login: { Component: ComingSoonPage },
  registro: { Component: ComingSoonPage },
  recuperar: { Component: ComingSoonPage },
  restablecer: { Component: ComingSoonPage },
  'cambiar-clave': { Component: ComingSoonPage },
  'verificar-correo': { Component: ComingSoonPage },
  privacidad: { lazy: legal((m) => m.PrivacyPage) },
  terminos: { lazy: legal((m) => m.TermsPage) },
  'terminos-artistas': { lazy: legal((m) => m.ArtistTermsPage) },
  pqrs: { lazy: legal((m) => m.PqrsPage) },
  reportar: { lazy: legal((m) => m.ReportPage) },
  panel: { Component: ComingSoonPage, splat: true },
  admin: { Component: ComingSoonPage, splat: true },
  _preview: { Component: ComingSoonPage },
};

const topLevelRoutes: RouteObject[] = APP_TOP_LEVEL_ROUTES.map((name) => {
  const def = TOP_LEVEL[name];
  const path = def.splat ? `${name}/*` : name;
  return def.lazy ? { path, lazy: def.lazy } : { path, Component: def.Component };
});

export const routes: RouteObject[] = [
  {
    Component: PublicLayout,
    HydrateFallback: PublicFallback,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, Component: IndexPage },
      ...topLevelRoutes,
      // React Router prioriza los segmentos estáticos: /:slug nunca tapa una ruta de arriba.
      { path: ':slug', Component: DjPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
];

/** Primer segmento de cada ruta estática (para el test contra RESERVED_SLUGS). */
export function topLevelStaticSegments(list: RouteObject[] = routes): string[] {
  const out: string[] = [];
  const walk = (items: RouteObject[]) => {
    for (const r of items) {
      if (r.path) {
        const first = r.path.replace(/^\//, '').split('/')[0] ?? '';
        if (first && !first.startsWith(':') && first !== '*') out.push(first);
      } else if (r.children) {
        walk(r.children);
      }
    }
  };
  walk(list);
  return out;
}
