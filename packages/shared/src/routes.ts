// Rutas de primer nivel de la web. Ningún DJ puede tomar estas como slug.
// router.tsx las importa, y un test verifica que todas estén en RESERVED_SLUGS.
export const APP_TOP_LEVEL_ROUTES = [
  'login',
  'registro',
  'recuperar',
  'restablecer',
  'cambiar-clave',
  'verificar-correo',
  'privacidad',
  'terminos',
  'terminos-artistas',
  'pqrs',
  'reportar',
  'panel',
  'admin',
  '_preview',
] as const;

// Rutas del api que el edge nginx trata aparte (límites de tasa, cabeceras).
// El test de despliegue comprueba que las regex de deploy/edge/default.conf coincidan.
export const API_ROUTES = {
  health: '/api/health',
  shell: '/api/public/shell',
  publicDjs: '/api/public/djs',
  publicDj: (slug: string) => `/api/public/djs/${slug}`,
  bookingToken: (slug: string) => `/api/public/djs/${slug}/booking-token`,
  bookingRequests: (slug: string) => `/api/public/djs/${slug}/booking-requests`,
  publicGenres: '/api/public/genres',
  tickets: '/api/public/tickets',
  sitemap: '/api/public/sitemap.xml',
  robots: '/api/public/robots.txt',
  authLogin: '/api/auth/login',
  authRegister: '/api/auth/register',
  authRefresh: '/api/auth/refresh',
  authForgot: '/api/auth/forgot-password',
  authReset: '/api/auth/reset-password',
} as const;

/** Para validar el parámetro `next` del login: solo rutas internas del panel o el admin. */
export function isSafeNextPath(next: unknown): next is string {
  return typeof next === 'string' && /^\/(panel|admin)(\/[A-Za-z0-9/_-]*)?$/.test(next);
}
