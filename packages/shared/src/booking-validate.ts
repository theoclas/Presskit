import { getBookingField } from './booking-fields';
import { addDays, daysBetween, isValidDateOnly } from './dates';
import { resolveFormFields, type ResolvedFormField } from './form-config';
import { LIMITS } from './limits';
import { cleanText } from './sanitize';
import { normalizeHttpsUrl } from './social-platforms';
import { isValidEmail } from './username';

export type BookingFieldError =
  | 'REQUIRED'
  | 'NOT_ALLOWED'
  | 'TOO_LONG'
  | 'INVALID'
  | 'OUT_OF_RANGE'
  | 'CARD_NUMBER';

export interface BookingValidation {
  /** Valores limpios, en el orden del formulario del DJ. */
  values: { key: string; label: string; value: string }[];
  errors: Record<string, BookingFieldError>;
}

const TEL_RE = /^\+?[0-9 ().-]{7,20}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const INT_RE = /^\d{1,6}$/;
const HANDLE_RE = /^@?([A-Za-z0-9._]{1,30})$/;

/** Teléfono razonable: 7-15 dígitos con +, espacios, guiones o paréntesis. Lo usan booking y tickets. */
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return TEL_RE.test(value) && digits.length >= 7 && digits.length <= 15;
}

/** Luhn: detecta números de tarjeta pegados en cualquier campo. */
export function containsCardNumber(value: string): boolean {
  const runs = value.replace(/[ -]/g, '').match(/\d{13,19}/g) ?? [];
  return runs.some((digits) => {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  });
}

function checkValue(field: ResolvedFormField, raw: string, today: string): { value: string } | { error: BookingFieldError } {
  const multiline = field.type === 'textarea';
  let value = cleanText(raw, { multiline, maxLines: LIMITS.booking.textareaMaxLines });
  if ([...value].length > field.maxLength) return { error: 'TOO_LONG' };
  if (containsCardNumber(value)) return { error: 'CARD_NUMBER' };

  switch (field.type) {
    case 'email':
      value = value.toLowerCase();
      if (!isValidEmail(value)) return { error: 'INVALID' };
      break;
    case 'tel':
      if (!isValidPhone(value)) return { error: 'INVALID' };
      break;
    case 'date': {
      if (!isValidDateOnly(value)) return { error: 'INVALID' };
      const ahead = daysBetween(today, value);
      if (ahead < (field.min ?? 0) || ahead > (field.max ?? LIMITS.events.maxDaysAhead)) return { error: 'OUT_OF_RANGE' };
      break;
    }
    case 'time':
      if (!TIME_RE.test(value)) return { error: 'INVALID' };
      break;
    case 'integer': {
      if (!INT_RE.test(value)) return { error: 'INVALID' };
      const n = Number(value);
      if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
        return { error: 'OUT_OF_RANGE' };
      }
      value = String(n);
      break;
    }
    case 'select':
      if (!field.options?.some((o) => o.value === value)) return { error: 'INVALID' };
      break;
    case 'url': {
      const r = normalizeHttpsUrl(value, field.maxLength);
      if (!r.ok) return { error: 'INVALID' };
      value = r.url;
      break;
    }
    case 'handle': {
      const m = HANDLE_RE.exec(value);
      if (!m) return { error: 'INVALID' };
      value = `@${m[1]}`;
      break;
    }
    default:
      break;
  }
  return { value };
}

/**
 * Valida un envío contra el formulario configurado por el DJ. Rechaza claves que no estén
 * activas (no las ignora en silencio). `today` es la fecha de Bogotá 'YYYY-MM-DD'.
 */
export function validateBookingSubmission(formConfig: unknown, input: unknown, today: string): BookingValidation {
  const fields = resolveFormFields(formConfig);
  const errors: BookingValidation['errors'] = {};
  const values: BookingValidation['values'] = [];
  const src = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

  const active = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(src)) {
    if (!active.has(key)) errors[key] = 'NOT_ALLOWED';
  }

  for (const field of fields) {
    const has = Object.prototype.hasOwnProperty.call(src, field.key);
    const raw = has ? src[field.key] : undefined;
    const str = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
    if (!str.trim()) {
      if (field.required) errors[field.key] = 'REQUIRED';
      continue;
    }
    const r = checkValue(field, str, today);
    if ('error' in r) errors[field.key] = r.error;
    else values.push({ key: field.key, label: field.label, value: r.value });
  }
  return { values, errors };
}

/** Rango de fechas válido para el campo fecha del formulario. */
export function bookingDateRange(today: string): { min: string; max: string } {
  const def = getBookingField('eventDate');
  return { min: addDays(today, def?.min ?? 0), max: addDays(today, def?.max ?? LIMITS.events.maxDaysAhead) };
}

export const BOOKING_ERROR_MESSAGES: Record<BookingFieldError, string> = {
  REQUIRED: 'Este campo es obligatorio.',
  NOT_ALLOWED: 'Este campo no es parte del formulario.',
  TOO_LONG: 'El texto es demasiado largo.',
  INVALID: 'Revisa el formato.',
  OUT_OF_RANGE: 'El valor está fuera del rango permitido.',
  CARD_NUMBER: 'No escribas números de tarjeta en este formulario.',
};
