import { AUTH_HEADERS, SESSION_HINT_COOKIE, isSafeNextPath, type ApiErrorDto, type MeDto, type SessionDto } from '@fersua/shared';
import axios, { isAxiosError, isCancel, type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Cliente HTTP del login, el panel y el admin (axios). Solo lo importan chunks diferidos:
// las páginas públicas usan lib/publicApi.ts con fetch para que axios no llegue a su bundle.
//
// - El access token vive solo en memoria (nunca en storage).
// - El refresh token es una cookie HttpOnly que maneja el navegador.
// - En el storage solo queda la marca 'fs_session' = '1' (sin datos) para saber si vale la
//   pena intentar un refresh silencioso al abrir la app.

export const API_BASE = '/api';

/** CSRF: el api exige esta cabecera en refresh, logout, mfa y step-up (y la mandamos siempre). */
const CSRF_HEADERS = { [AUTH_HEADERS.xhrName]: AUTH_HEADERS.xhrValue } as const;

/** Cabecera con el token de step-up para las acciones destructivas del admin. */
export function stepUpHeaders(token: string): Record<string, string> {
  return { [AUTH_HEADERS.stepUp]: token };
}

// Mismo nombre que la cookie que pone el api: la marca vive en localStorage o en esa cookie.
const SESSION_HINT_KEY = SESSION_HINT_COOKIE;
const SESSION_HINT_RE = new RegExp(`(?:^|;\\s*)${SESSION_HINT_COOKIE}=1(?:;|$)`);
const BROADCAST_NAME = 'fersua-auth';
const REFRESH_LOCK = 'fersua-refresh';
/** Se renueva antes de tiempo si al token le queda menos que esto. */
const EARLY_REFRESH_MS = 30_000;
/** Si otra pestaña ya renovó y el token le dura al menos esto, se reutiliza. */
const SHARED_TOKEN_MIN_MS = 60_000;

const NETWORK_MESSAGE = 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';

// ---------------------------------------------------------------- estado en memoria

let accessToken: string | null = null;
/** Momento (ms, reloj local) en que vence el access token; 0 si no se sabe. */
let accessExpiresAt = 0;
let sessionUser: MeDto | null = null;

export type SessionEvent =
  | { type: 'session'; session: SessionDto }
  | { type: 'user'; user: MeDto }
  | { type: 'cleared'; reason: 'logout' | 'expired' };

const listeners = new Set<(e: SessionEvent) => void>();

/** AuthProvider y la caché del step-up escuchan aquí los cambios de sesión. */
export function onSessionEvent(fn: (e: SessionEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(e: SessionEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(e);
    } catch {
      // Un listener roto no puede tumbar la sesión de los demás.
    }
  }
}

/** Lee `exp` del JWT sin verificarlo (solo para saber cuándo renovar; el api es quien valida). */
function decodeExpMs(token: string): number {
  try {
    const part = token.split('.')[1];
    if (!part) return 0;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function setAccessToken(t: string | null, expiresInSec?: number): void {
  accessToken = t;
  if (!t) {
    accessExpiresAt = 0;
    return;
  }
  // expiresIn es relativo a ahora: no depende de que el reloj del equipo esté en hora.
  accessExpiresAt = typeof expiresInSec === 'number' && expiresInSec > 0 ? Date.now() + expiresInSec * 1000 : decodeExpMs(t);
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Usuario de la sesión en memoria (lo usa AuthProvider al montarse otra vez). */
export function getSessionUser(): MeDto | null {
  return sessionUser;
}

export function setSessionUser(user: MeDto): void {
  sessionUser = user;
  emit({ type: 'user', user });
}

// ---------------------------------------------------------------- marca de sesión

export function hasSessionHint(): boolean {
  try {
    if (localStorage.getItem(SESSION_HINT_KEY) === '1') return true;
  } catch {
    // Storage bloqueado (modo privado de algunos navegadores): se mira la cookie.
  }
  // El servidor también puede poner la cookie fs_session=1 (sin datos, no HttpOnly).
  return typeof document !== 'undefined' && SESSION_HINT_RE.test(document.cookie);
}

function setSessionHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Sin storage solo se pierde el refresh silencioso al abrir otra pestaña.
  }
}

// ---------------------------------------------------------------- entre pestañas

type BroadcastMsg = { type: 'session'; session: SessionDto } | { type: 'logout' };

let channel: BroadcastChannel | null | undefined;
/** Última sesión que llegó de otra pestaña (para no renovar dos veces seguidas). */
let lastShared: { session: SessionDto; at: number; expiresAt: number } | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof BroadcastChannel === 'undefined') {
    channel = null;
    return channel;
  }
  try {
    channel = new BroadcastChannel(BROADCAST_NAME);
    // En Node (pruebas) el canal no debe mantener vivo el proceso.
    (channel as unknown as { unref?: () => void }).unref?.();
    channel.onmessage = (ev: MessageEvent<unknown>) => onBroadcast(ev.data);
  } catch {
    channel = null;
  }
  return channel;
}

function broadcast(msg: BroadcastMsg): void {
  try {
    getChannel()?.postMessage(msg);
  } catch {
    // Si el mensaje no se puede enviar, la otra pestaña renovará por su cuenta.
  }
}

function isSessionDto(v: unknown): v is SessionDto {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.accessToken === 'string' && typeof o.expiresIn === 'number' && !!o.user && typeof o.user === 'object';
}

function onBroadcast(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const msg = data as { type?: unknown; session?: unknown };
  if (msg.type === 'session' && isSessionDto(msg.session)) {
    const session = msg.session;
    lastShared = { session, at: Date.now(), expiresAt: Date.now() + session.expiresIn * 1000 };
    applySession(session, { broadcast: false });
  } else if (msg.type === 'logout') {
    clearLocalSession();
    emit({ type: 'cleared', reason: 'logout' });
  }
}

// ---------------------------------------------------------------- sesión

let expiredNotified = false;

/** Guarda una sesión nueva (login, MFA, refresh o cambio de contraseña) y avisa a los demás. */
export function applySession(session: SessionDto, opts: { broadcast?: boolean } = {}): void {
  setAccessToken(session.accessToken, session.expiresIn);
  sessionUser = session.user;
  expiredNotified = false;
  setSessionHint(true);
  if (opts.broadcast !== false) broadcast({ type: 'session', session });
  // Abre el canal para escuchar logout/refresh de otras pestañas desde ya.
  getChannel();
  emit({ type: 'session', session });
}

/** Borra el estado local (token, usuario y marca) sin llamar al api. */
export function clearLocalSession(): void {
  setAccessToken(null);
  sessionUser = null;
  setSessionHint(false);
}

/** Tras POST /auth/logout: borra la sesión local, avisa a las otras pestañas y a los listeners. */
export function endLocalSession(): void {
  clearLocalSession();
  broadcast({ type: 'logout' });
  emit({ type: 'cleared', reason: 'logout' });
}

// ---------------------------------------------------------------- instancias axios

/** Sin interceptores: solo para /auth/refresh (así un 401 del refresh nunca entra en bucle). */
export const rawHttp = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 20_000,
  headers: { ...CSRF_HEADERS },
});

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 20_000,
  headers: { ...CSRF_HEADERS },
});

/** Ruta relativa al api sin query: '/api/auth/login?x' -> '/auth/login'. */
function apiPath(url: string | undefined): string {
  if (!url) return '';
  let p = url.split('?')[0] ?? '';
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return p;
    }
  }
  if (!p.startsWith('/')) p = `/${p}`;
  if (p === API_BASE || p.startsWith(`${API_BASE}/`)) p = p.slice(API_BASE.length) || '/';
  return p;
}

/** Endpoints de sesión: nunca disparan refresh ni reintento. */
const SESSION_PATHS = new Set(['/auth/login', '/auth/mfa', '/auth/refresh', '/auth/logout']);

/**
 * 401 que significan "contraseña o código incorrectos" (cambio de contraseña, step-up), no
 * sesión vencida: reintentarlos contaría dos intentos contra el límite. Cualquier otro 401
 * en esos endpoints sí es sesión vencida y se renueva como en el resto.
 */
const CREDENTIAL_CODES = new Set(['INVALID_CREDENTIALS', 'INVALID_CODE', 'MFA_INVALID', 'STEP_UP_INVALID']);

let refreshing: Promise<SessionDto> | null = null;

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return fn();
  return locks.request(REFRESH_LOCK, fn) as Promise<T>;
}

function waitForSharedSession(since: number, ms: number): Promise<SessionDto | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (lastShared && lastShared.at >= since) return resolve(lastShared.session);
      if (Date.now() >= deadline) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Renueva la sesión con la cookie de refresh. Single-flight: N llamadas simultáneas
 * comparten un solo POST /auth/refresh, y entre pestañas se serializa con Web Locks.
 * No redirige: quien llama decide qué hacer si falla.
 */
export function refreshSession(): Promise<SessionDto> {
  if (refreshing) return refreshing;
  const requestedAt = Date.now();
  refreshing = withRefreshLock(async () => {
    // Otra pestaña pudo renovar mientras esperábamos el candado: su token sirve igual.
    if (lastShared && lastShared.at >= requestedAt && lastShared.expiresAt - Date.now() > SHARED_TOKEN_MIN_MS) {
      applySession(lastShared.session, { broadcast: false });
      return lastShared.session;
    }
    try {
      const { data } = await rawHttp.post<SessionDto>('/auth/refresh');
      if (!isSessionDto(data)) throw new Error('Respuesta de refresh inválida');
      applySession(data);
      return data;
    } catch (e) {
      // REFRESH_RACE: otra pestaña (sin Web Locks) rotó la cookie hace un instante.
      // Se reintenta una sola vez, y solo con el token que ella comparta.
      if (isAxiosError(e) && e.response?.status === 401 && errorCode(e) === 'REFRESH_RACE') {
        const shared = await waitForSharedSession(requestedAt, 2_000);
        if (shared) {
          applySession(shared, { broadcast: false });
          return shared;
        }
      }
      throw e;
    }
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function errorCode(e: AxiosError): string | null {
  const data = e.response?.data as { code?: unknown } | undefined;
  return data && typeof data.code === 'string' ? data.code : null;
}

/** 401/403 del refresh = la sesión ya no sirve. Un error de red o 5xx no cierra la sesión. */
function isSessionRejected(e: unknown): boolean {
  if (!isAxiosError(e)) return true;
  const s = e.response?.status;
  return s === 401 || s === 403;
}

// ---------------------------------------------------------------- redirección al login

type LoginRedirect = (url: string) => void;
let loginRedirect: LoginRedirect | null = null;

/** AuthProvider la cambia por una navegación del router; por defecto recarga la página. */
export function setLoginRedirect(fn: LoginRedirect | null): void {
  loginRedirect = fn;
}

/** '/login?next=/admin/x' solo si la ruta actual es interna del panel o el admin. */
export function loginUrlFor(path: string): string {
  return isSafeNextPath(path) ? `/login?next=${encodeURIComponent(path)}` : '/login';
}

function expireSession(): void {
  if (expiredNotified) return;
  expiredNotified = true;
  clearLocalSession();
  emit({ type: 'cleared', reason: 'expired' });
  const path = window.location.pathname;
  if (path === '/login') return;
  const url = loginUrlFor(path);
  if (loginRedirect) loginRedirect(url);
  else window.location.assign(url);
}

// ---------------------------------------------------------------- interceptores

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.request.use(async (config) => {
  config.headers.set(AUTH_HEADERS.xhrName, AUTH_HEADERS.xhrValue);
  const path = apiPath(config.url);
  // Renovación anticipada: evita el 401 y el reintento (que en step-up reenvía la contraseña).
  if (
    accessToken &&
    accessExpiresAt > 0 &&
    accessExpiresAt - Date.now() < EARLY_REFRESH_MS &&
    !SESSION_PATHS.has(path)
  ) {
    try {
      await refreshSession();
    } catch {
      // Si falla, la petición sale con el token viejo y el 401 decide.
    }
  }
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  else config.headers.delete('Authorization');
  return config;
});

http.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isAxiosError(error)) throw error;
  const cfg = error.config as RetryConfig | undefined;
  if (!cfg || error.response?.status !== 401 || cfg._retried) throw error;
  const path = apiPath(cfg.url);
  if (SESSION_PATHS.has(path)) throw error;
  const code = errorCode(error);
  if (code && CREDENTIAL_CODES.has(code)) throw error;

  cfg._retried = true;
  try {
    await refreshSession();
  } catch (e) {
    if (isSessionRejected(e)) expireSession();
    throw error;
  }
  return http.request(cfg);
});

// ---------------------------------------------------------------- errores

function isErrorBody(v: unknown): v is { code: string; message: string; details?: unknown } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.code === 'string' && typeof o.message === 'string';
}

function cleanDetails(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

/** `retry` de TanStack Query para consultas con http: solo red o 5xx, máximo 2 veces. */
export function shouldRetryHttp(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const e = apiError(error);
  return e.code === 'NETWORK' || e.statusCode >= 500;
}

/** Normaliza cualquier error de http a ApiErrorDto. Sin respuesta del servidor = 'NETWORK'. */
export function apiError(e: unknown): ApiErrorDto {
  if (isCancel(e)) return { statusCode: 0, code: 'CANCELED', message: 'Se canceló la solicitud.' };
  if (isAxiosError(e)) {
    const res = e.response;
    if (!res) return { statusCode: 0, code: 'NETWORK', message: NETWORK_MESSAGE };
    if (isErrorBody(res.data)) {
      const details = cleanDetails(res.data.details);
      return { statusCode: res.status, code: res.data.code, message: res.data.message, ...(details ? { details } : {}) };
    }
    const status = res.status;
    return {
      statusCode: status,
      code: status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : status === 413 ? 'PAYLOAD_TOO_LARGE' : `HTTP_${status}`,
      message:
        status >= 500
          ? 'El servidor no respondió bien. Intenta de nuevo en un momento.'
          : status === 429
            ? 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.'
            : 'No se pudo completar la solicitud.',
    };
  }
  return { statusCode: 0, code: 'UNKNOWN', message: 'Ocurrió un error inesperado. Intenta de nuevo.' };
}
