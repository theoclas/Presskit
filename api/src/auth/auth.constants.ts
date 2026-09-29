import type { UserRole } from '@prisma/client';
import { AUTH_HEADERS } from '@fersua/shared';

// Valores fijos de auth. Están aquí y no en .env a propósito: cambiarlos es una decisión de
// seguridad que pasa por revisión de código, no un ajuste de despliegue.

export const JWT_ISSUER = 'fersua-booking';
export const JWT_AUDIENCE_ACCESS = 'fersua-booking-web';
// Audiencias distintas (y secretos derivados distintos): un token de MFA o de step-up nunca
// sirve como access token, ni al revés.
export const JWT_AUDIENCE_MFA = 'fersua-booking-mfa';
export const JWT_AUDIENCE_STEP_UP = 'fersua-booking-step-up';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const MFA_TTL_SECONDS = 5 * 60;
export const STEP_UP_TTL_SECONDS = 5 * 60;
/** Intentos de código por cada mfaToken; después hay que volver a poner la contraseña. */
export const MFA_MAX_ATTEMPTS = 3;

const DAY = 24 * 60 * 60 * 1000;

/** Sesiones: inactividad máxima (idle) y vida absoluta de la familia de refresh tokens. */
export const SESSION_TTL: Record<UserRole, { idleMs: number; absoluteMs: number }> = {
  USER: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
  ADMIN: { idleMs: 1 * DAY, absoluteMs: 7 * DAY },
};

/** Dentro de esta ventana, un refresh ya rotado es otra pestaña compitiendo (REFRESH_RACE). */
export const REFRESH_GRACE_MS = 10_000;
/** Más respuestas RACE que esto en una familia se tratan como robo y la revocan. */
export const REFRESH_MAX_RACES = 2;

// Nombres de cabecera en minúscula (así las expone Node); los valores salen de shared para que
// la web y el api no puedan desalinearse.
/** Cabecera CSRF obligatoria en refresh, logout, mfa y step-up. */
export const XHR_HEADER = AUTH_HEADERS.xhrName.toLowerCase();
export const XHR_HEADER_VALUE = AUTH_HEADERS.xhrValue;
/** Cabecera con el token de step-up en las acciones destructivas del admin. */
export const STEP_UP_HEADER = AUTH_HEADERS.stepUp.toLowerCase();

export const LOCKOUT = {
  /** Fallos de la pareja (usuario, IP /64) antes del primer bloqueo. */
  pairThreshold: 5,
  pairBaseMinutes: 15,
  pairMaxMinutes: 240,
  /** Sin fallos durante este tiempo, la pareja vuelve a cero. */
  pairResetMs: DAY,
  /** Tope suave por usuario (todas las IPs): cada 30 fallos seguidos, 60 min de bloqueo. */
  userSoftCap: 30,
  userLockMinutes: 60,
  /** Cookie de dispositivo conocido: salta los bloqueos (patrón de OWASP). */
  knownDeviceDays: 90,
} as const;

/**
 * Segundo factor del admin, por usuario y entre todos los mfaToken (MFA_MAX_ATTEMPTS es por
 * token y cada login con la contraseña correcta da uno nuevo). Tras 3 códigos malos seguidos,
 * pausa de 15·2^(n−3) min (máx. 240) para pedir otro código, salvo desde un dispositivo
 * conocido: el admin nunca queda afuera de su propio navegador (H6).
 */
export const MFA_LOCKOUT = {
  threshold: 3,
  baseMinutes: 15,
  maxMinutes: 240,
} as const;

export const ISSUER_LABEL = 'Fersua Studio';
