import { APP_TOP_LEVEL_ROUTES } from '@fersua/shared';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { PublicFallback, PublicLayout } from './public/layouts/PublicLayout';
import { ErrorPage } from './public/pages/ErrorPage';
import { DjPage } from './public/pages/DjPage';
import { IndexPage } from './public/pages/IndexPage';
import { NotFoundPage } from './public/pages/NotFoundPage';

type TopLevel = (typeof APP_TOP_LEVEL_ROUTES)[number];
type LazyPage = () => Promise<{ Component: ComponentType }>;

// Las páginas legales van en su propio chunk (texto largo que no necesita la página del DJ).
const legal = (pick: (m: typeof import('./public/legal/LegalPages')) => ComponentType): LazyPage => () =>
  import('./public/legal/LegalPages').then((m) => ({ Component: pick(m) }));

// Ingreso, cuenta, panel y admin: chunks aparte. axios, antd y dayjs solo llegan por aquí (ver scripts/ci/check-bundle.mjs).
const loginPage: LazyPage = () => import('./auth/LoginPage').then((m) => ({ Component: m.LoginPage }));
const registerPage: LazyPage = () => import('./auth/RegisterPage').then((m) => ({ Component: m.RegisterPage }));
const forgotPasswordPage: LazyPage = () =>
  import('./auth/ForgotPasswordPage').then((m) => ({ Component: m.ForgotPasswordPage }));
const resetPasswordPage: LazyPage = () =>
  import('./auth/ResetPasswordPage').then((m) => ({ Component: m.ResetPasswordPage }));
const verifyEmailPage: LazyPage = () => import('./auth/VerifyEmailPage').then((m) => ({ Component: m.VerifyEmailPage }));
const changePasswordPage: LazyPage = () =>
  import('./auth/ChangePasswordPage').then((m) => ({ Component: m.ChangePasswordPage }));
const panelApp: LazyPage = () => import('./panel/PanelApp').then((m) => ({ Component: m.PanelApp }));
const adminApp: LazyPage = () => import('./admin/AdminApp').then((m) => ({ Component: m.AdminApp }));
const previewPage: LazyPage = () => import('./public/pages/PreviewPage').then((m) => ({ Component: m.PreviewPage }));
const authRoot: LazyPage = () => import('./auth/AuthRoot').then((m) => ({ Component: m.AuthRoot }));

interface TopLevelDef {
  lazy?: LazyPage;
  Component?: ComponentType;
  splat?: boolean;
  /** Va dentro de AuthRoot (AuthProvider + cliente http). */
  auth?: boolean;
}

/**
 * Una entrada por cada ruta de APP_TOP_LEVEL_ROUTES (el Record obliga a cubrirlas todas).
 * Las páginas de cuenta (registro, recuperar, restablecer, verificar correo) y el panel del DJ
 * van dentro de AuthRoot: usan el cliente http y la sesión (registrarse deja la sesión iniciada).
 */
const TOP_LEVEL: Record<TopLevel, TopLevelDef> = {
  login: { lazy: loginPage, auth: true },
  registro: { lazy: registerPage, auth: true },
  recuperar: { lazy: forgotPasswordPage, auth: true },
  restablecer: { lazy: resetPasswordPage, auth: true },
  'cambiar-clave': { lazy: changePasswordPage, auth: true },
  'verificar-correo': { lazy: verifyEmailPage, auth: true },
  privacidad: { lazy: legal((m) => m.PrivacyPage) },
  terminos: { lazy: legal((m) => m.TermsPage) },
  'terminos-artistas': { lazy: legal((m) => m.ArtistTermsPage) },
  pqrs: { lazy: legal((m) => m.PqrsPage) },
  reportar: { lazy: legal((m) => m.ReportPage) },
  panel: { lazy: panelApp, splat: true, auth: true },
  admin: { lazy: adminApp, splat: true, auth: true },
  _preview: { lazy: previewPage, auth: true },
};

function topLevelRoute(name: TopLevel): RouteObject {
  const def = TOP_LEVEL[name];
  const path = def.splat ? `${name}/*` : name;
  return def.lazy ? { path, lazy: def.lazy } : { path, Component: def.Component };
}

const publicTopLevel = APP_TOP_LEVEL_ROUTES.filter((n) => !TOP_LEVEL[n].auth).map(topLevelRoute);
const authTopLevel = APP_TOP_LEVEL_ROUTES.filter((n) => TOP_LEVEL[n].auth).map(topLevelRoute);

export const routes: RouteObject[] = [
  {
    Component: PublicLayout,
    HydrateFallback: PublicFallback,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, Component: IndexPage },
      ...publicTopLevel,
      // Layout sin ruta propia: sus hijas siguen siendo de primer nivel (/login, /admin/*...).
      { id: 'auth-root', lazy: authRoot, children: authTopLevel },
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
