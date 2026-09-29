import { HttpStatus } from '@nestjs/common';
import { LIMITS, getBookingField, isWellFormedText, type BookingValidation } from '@fersua/shared';
import { AppError, Errors } from '../common/errors';
import { dateOnlyToDb } from '../public/date-only';

// Reglas puras del envío del formulario (sin BD), para poder probarlas una por una.

/** Máximo de claves en `fields`: el catálogo tiene 27 campos. */
export const FIELDS_MAX_KEYS = 30;
/** Tope por valor antes de limpiar (el catálogo llega a 2000; esto corta basura enorme). */
const RAW_VALUE_MAX = 5_000;
/** Las claves de error que se devuelven: nunca se refleja una clave arbitraria del cliente. */
const SAFE_KEY_RE = /^[A-Za-z0-9_]{1,40}$/;

export type SpamReason = 'HONEYPOT' | 'CAP_IP_PROFILE' | 'CAP_IP' | 'CAP_PROFILE';

/** Solicitudes de las últimas 24 h, antes de guardar la actual. */
export interface RecentCounts {
  ipProfile: number;
  ip: number;
  profile: number;
}

/**
 * Pasado un tope NO se responde 429: se guarda como SPAM y el visitante ve la respuesta normal.
 * Así un spammer no puede dejar a un DJ sin solicitudes del día, y el DJ igual puede revisarlas.
 */
export function spamReason(honeypotFilled: boolean, counts: RecentCounts): SpamReason | null {
  if (honeypotFilled) return 'HONEYPOT';
  if (counts.ipProfile >= LIMITS.booking.perIpPerProfilePerDay) return 'CAP_IP_PROFILE';
  if (counts.ip >= LIMITS.booking.perIpPerDay) return 'CAP_IP';
  if (counts.profile >= LIMITS.booking.perProfilePerDay) return 'CAP_PROFILE';
  return null;
}

export function isHoneypotFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeErrorKey(key: string): string {
  return SAFE_KEY_RE.test(key) ? key : '_';
}

/** Errores del validador compartido con claves seguras para devolver. */
export function safeFieldErrors(errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, code] of Object.entries(errors).slice(0, FIELDS_MAX_KEYS)) out[safeErrorKey(key)] = code;
  return out;
}

/**
 * `fields` llega sin validación anidada (ValidationPipe solo comprueba que sea objeto): aquí
 * se exige objeto plano, máx. 30 claves, solo strings y tamaño total acotado.
 */
export function checkFieldsShape(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Errors.validation({ fields: 'INVALID' });
  const keys = Object.keys(input);
  if (keys.length > FIELDS_MAX_KEYS) throw Errors.validation({ fields: 'TOO_MANY' });
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of keys) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== 'string') throw Errors.validation({ [safeErrorKey(key)]: 'INVALID' });
    if (value.length > RAW_VALUE_MAX) throw Errors.validation({ [safeErrorKey(key)]: 'TOO_LONG' });
    // Mitad suelta de un emoji ("\ud83d" es JSON válido): un navegador no la produce, y en la
    // BD haría fallar la consulta. Es un 400 del cliente, no un error del servidor.
    if (!isWellFormedText(value)) throw Errors.validation({ [safeErrorKey(key)]: 'INVALID' });
    out[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > LIMITS.booking.payloadMaxBytes) {
    throw new AppError(HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado larga.');
  }
  return out;
}

export interface ContactColumns {
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  eventDate: Date | null;
}

/** Columnas desnormalizadas de BookingRequest, según el `contact` de cada campo del catálogo. */
export function contactColumns(values: BookingValidation['values']): ContactColumns {
  const out: ContactColumns = { contactName: '', contactEmail: null, contactPhone: null, eventDate: null };
  for (const v of values) {
    switch (getBookingField(v.key)?.contact) {
      case 'name':
        out.contactName = [...v.value].slice(0, 80).join('');
        break;
      case 'email':
        out.contactEmail = v.value.slice(0, 254);
        break;
      case 'phone':
        out.contactPhone = v.value.slice(0, 20);
        break;
      case 'eventDate':
        out.eventDate = dateOnlyToDb(v.value);
        break;
      default:
        break;
    }
  }
  return out;
}
