import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { LIMITS } from '@fersua/shared';
import { AppConfig } from '../config/app-config.service';
import { hmacHex, safeEqual } from '../common/crypto';
import { AppError } from '../common/errors';

// Token de los formularios públicos: base64url(JSON {p, s, iat, n}) + "." + HMAC-SHA256 en hex.
// Prueba que el formulario se cargó desde nuestra página (para qué formulario y, en booking,
// con qué slug), que no se envió en menos de 2 s (bots) ni después de 2 h, y el nonce hace que
// sirva una sola vez. El propósito va firmado: un token de booking no sirve para tickets ni al
// revés, aunque el alcance coincida.

export type FormTokenErrorCode = 'FORM_TOKEN_INVALID' | 'FORM_TOO_FAST' | 'FORM_EXPIRED' | 'FORM_TOKEN_USED';

/** booking: formulario de un DJ (alcance = slug). ticket: PQRS y reportes (alcance fijo). */
export type FormTokenPurpose = 'booking' | 'ticket';

const MESSAGES: Record<FormTokenErrorCode, string> = {
  FORM_TOKEN_INVALID: 'El formulario no es válido. Recarga la página e intenta de nuevo.',
  FORM_TOO_FAST: 'Espera un momento antes de enviar el formulario.',
  FORM_EXPIRED: 'El formulario expiró. Vuelve a enviarlo.',
  FORM_TOKEN_USED: 'Este formulario ya se envió. Recarga la página para enviar otra solicitud.',
};

export class FormTokenError extends AppError {
  constructor(code: FormTokenErrorCode) {
    super(HttpStatus.BAD_REQUEST, code, MESSAGES[code]);
  }
}

export interface FormTokenPayload {
  /** propósito */
  p: FormTokenPurpose;
  /** alcance: slug del perfil en booking; constante en tickets */
  s: string;
  /** emitido (ms epoch) */
  iat: number;
  /** 16 bytes aleatorios en hex */
  n: string;
}

const NONCE_RE = /^[0-9a-f]{32}$/;
const SIG_RE = /^[0-9a-f]{64}$/;
const TOKEN_MAX = 300;

@Injectable()
export class FormTokenService {
  constructor(private readonly config: AppConfig) {}

  // v2 (M4): el payload trae el propósito. Los tokens v1 (solo booking, sin propósito) dejan de
  // valer al desplegar; la web pide otro sola ante FORM_TOKEN_INVALID.
  private sign(body: string): string {
    return hmacHex(this.config.bookingFormSecret, `form-token.v2.${body}`);
  }

  issue(purpose: FormTokenPurpose, scope: string, now: number = Date.now()): string {
    const payload: FormTokenPayload = { p: purpose, s: scope, iat: now, n: randomBytes(16).toString('hex') };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  /** Verifica firma, propósito, alcance y edad. El nonce se consume aparte (en la BD), al guardar. */
  verify(token: unknown, purpose: FormTokenPurpose, scope: string, now: number = Date.now()): FormTokenPayload {
    if (typeof token !== 'string' || token.length > TOKEN_MAX) throw new FormTokenError('FORM_TOKEN_INVALID');
    const dot = token.lastIndexOf('.');
    if (dot <= 0) throw new FormTokenError('FORM_TOKEN_INVALID');
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!SIG_RE.test(sig) || !safeEqual(this.sign(body), sig)) throw new FormTokenError('FORM_TOKEN_INVALID');

    let payload: Partial<FormTokenPayload>;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<FormTokenPayload>;
    } catch {
      throw new FormTokenError('FORM_TOKEN_INVALID');
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.p !== purpose ||
      payload.s !== scope ||
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      typeof payload.n !== 'string' ||
      !NONCE_RE.test(payload.n)
    ) {
      throw new FormTokenError('FORM_TOKEN_INVALID');
    }

    const age = now - payload.iat;
    if (age < LIMITS.booking.tokenMinAgeMs) throw new FormTokenError('FORM_TOO_FAST');
    if (age > LIMITS.booking.tokenMaxAgeMs) throw new FormTokenError('FORM_EXPIRED');
    return { p: payload.p, s: payload.s, iat: payload.iat, n: payload.n };
  }

  /** Hasta cuándo hay que recordar el nonce: después el token expira solo. */
  nonceExpiresAt(payload: FormTokenPayload): Date {
    return new Date(payload.iat + LIMITS.booking.tokenMaxAgeMs);
  }
}
