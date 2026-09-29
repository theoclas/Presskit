import { LIMITS } from './limits';
import { APP_TOP_LEVEL_ROUTES } from './routes';

// 3-40 caracteres, minúsculas ASCII y guiones, empieza y termina en alfanumérico,
// sin '--' y no puede ser solo números.
export const SLUG_RE = /^(?!\d+$)(?!.*--)[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const RESERVED_WORDS = [
  // auth / cuenta
  'auth', 'logout', 'signin', 'signup', 'register', 'ingresar', 'entrar', 'salir', 'cuenta', 'account',
  'dashboard', 'perfil', 'profile', 'settings', 'ajustes', 'config', 'password', 'contrasena', 'reset',
  'forgot', 'verify', 'verificar', 'me', 'new', 'nuevo', 'crear', 'edit', 'editar', 'delete', 'preview',
  'administrador', 'app',
  // assets / infraestructura
  'api', 'static', 'assets', 'media', 'uploads', 'img', 'images', 'imagenes', 'icons', 'css', 'js', 'fonts',
  'favicon', 'robots', 'sitemap', 'manifest', 'health', 'healthz', 'status', 'metrics', 'well-known', 'cdn',
  'ws', 'socket', 'graphql', 'oauth', 'sso', 'callback', 'webhook', 'webhooks',
  // hosts / correo
  'www', 'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'beta', 'booking', 'dev', 'test', 'staging', 'demo',
  'root', 'localhost', 'postmaster', 'hostmaster', 'webmaster', 'abuse', 'noreply', 'no-reply', 'security',
  'seguridad',
  // contenido / legal
  'about', 'acerca', 'nosotros', 'contact', 'contacto', 'help', 'ayuda', 'support', 'soporte', 'faq',
  'terms', 'condiciones', 'privacy', 'legal', 'aviso-legal', 'aviso-privacidad', 'habeas-data',
  'politica-de-datos', 'tratamiento-de-datos', 'cookies', 'blog', 'news', 'noticias', 'search', 'buscar',
  'explore', 'explorar', 'home', 'inicio', 'index', 'bookings', 'reservas', 'djs', 'dj', 'artistas',
  'artists', 'eventos', 'events', 'fechas', 'generos', 'genres', 'users', 'user', 'usuario', 'usuarios',
  'system', 'sistema', 'moderator', 'moderador', 'billing', 'pagos', 'checkout', 'null', 'undefined',
  'fecha', '404', '500',
  // marca y otros proyectos que vivían en el dominio
  'fersua', 'fersuastudio', 'fersua-studio', 'fersuaestudio', 'studio', 'oficial', 'official', 'allset',
  'pedido', 'default', 'corporaciondestellos',
];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set<string>([...APP_TOP_LEVEL_ROUTES, ...RESERVED_WORDS]);

const RESERVED_PREFIXES = ['admin', 'api', 'fersua', 'www', 'static', 'media'];

export type SlugError = 'FORMAT' | 'RESERVED';

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function validateSlug(input: unknown): SlugError | null {
  if (typeof input !== 'string') return 'FORMAT';
  const slug = input;
  if (slug.length < LIMITS.profile.slugMin || slug.length > LIMITS.profile.slugMax) return 'FORMAT';
  if (!SLUG_RE.test(slug)) return 'FORMAT';
  if (RESERVED_SLUGS.has(slug)) return 'RESERVED';
  if (RESERVED_PREFIXES.some((p) => slug === p || slug.startsWith(`${p}-`))) return 'RESERVED';
  return null;
}

/** 'Mike Bran & Macfly' → 'mike-bran-y-macfly'. */
export function suggestSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.profile.slugMax)
    .replace(/-+$/g, '');
  return base.length >= LIMITS.profile.slugMin ? base : `${base}-dj`.replace(/^-/, '');
}
