import type { CookieOptions, Request, Response } from 'express';
import { SESSION_HINT_COOKIE as SESSION_HINT } from '@fersua/shared';

/**
 * Cookies de sesión.
 * - Refresh: `__Host-rt` (HttpOnly, Secure, SameSite=Strict, Path=/, sin Domain). El prefijo
 *   __Host- impide que un subdominio hermano la siembre (cookie tossing). Como exige Secure,
 *   en desarrollo (COOKIE_SECURE=false) se llama `rt`.
 * - Dispositivo conocido: `__Host-kd` / `kd`, HttpOnly. Salta los bloqueos por intentos.
 * - Pista `fs_session=1`: sin datos y legible por JS, solo para que la web sepa si vale la
 *   pena intentar un refresh silencioso.
 */
export const REFRESH_COOKIE_SECURE = '__Host-rt';
export const REFRESH_COOKIE_DEV = 'rt';
export const KNOWN_DEVICE_COOKIE_SECURE = '__Host-kd';
export const KNOWN_DEVICE_COOKIE_DEV = 'kd';
export const SESSION_HINT_COOKIE = SESSION_HINT;

const REFRESH_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function refreshCookieName(secure: boolean): string {
  return secure ? REFRESH_COOKIE_SECURE : REFRESH_COOKIE_DEV;
}

export function knownDeviceCookieName(secure: boolean): string {
  return secure ? KNOWN_DEVICE_COOKIE_SECURE : KNOWN_DEVICE_COOKIE_DEV;
}

function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/' };
}

export function setRefreshCookies(res: Response, secure: boolean, token: string, expiresAt: Date, familyExpiresAt: Date): void {
  res.cookie(refreshCookieName(secure), token, { ...baseOptions(secure), expires: expiresAt });
  res.cookie(SESSION_HINT_COOKIE, '1', { httpOnly: false, secure, sameSite: 'lax', path: '/', expires: familyExpiresAt });
}

export function clearRefreshCookies(res: Response, secure: boolean): void {
  res.clearCookie(refreshCookieName(secure), baseOptions(secure));
  res.clearCookie(SESSION_HINT_COOKIE, { httpOnly: false, secure, sameSite: 'lax', path: '/' });
}

/** El refresh token de la cookie si tiene la forma exacta (43 caracteres base64url), o null. */
export function readRefreshCookie(req: Request, secure: boolean): string | null {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const raw = cookies?.[refreshCookieName(secure)];
  return typeof raw === 'string' && REFRESH_TOKEN_RE.test(raw) ? raw : null;
}

export function isWellFormedRefreshToken(raw: unknown): raw is string {
  return typeof raw === 'string' && REFRESH_TOKEN_RE.test(raw);
}

export function setKnownDeviceCookie(res: Response, secure: boolean, value: string, expires: Date): void {
  res.cookie(knownDeviceCookieName(secure), value, { ...baseOptions(secure), expires });
}

export function readKnownDeviceCookie(req: Request, secure: boolean): string | null {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const raw = cookies?.[knownDeviceCookieName(secure)];
  return typeof raw === 'string' && raw.length <= 200 ? raw : null;
}
