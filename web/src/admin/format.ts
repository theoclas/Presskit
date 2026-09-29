import { isValidDateOnly, isValidEmail } from '@fersua/shared';

// Fechas del admin siempre en hora de Bogotá, sin depender de la zona del equipo.

const TZ = 'America/Bogota';

const dateTimeFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** ISO -> 'sáb, 14 nov 2026, 3:40 p. m.' ('—' si falta o es inválida). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

/** 'YYYY-MM-DD' (o ISO) -> 'sáb, 14 nov 2026'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  // Mediodía de Bogotá: el día nunca se corre por la zona horaria.
  const d = isValidDateOnly(value) ? new Date(`${value}T12:00:00-05:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

/**
 * Número para wa.me: solo dígitos. Un celular colombiano de 10 dígitos (3xx) recibe el 57.
 * null si no parece un número de WhatsApp.
 */
export function waDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) digits = `57${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function waLink(phone: string | null | undefined): string | null {
  const digits = waDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

/** mailto solo con un correo válido (sin '?', '&' ni saltos que agreguen cabeceras). */
export function mailtoLink(email: string | null | undefined, subject?: string): string | null {
  const e = email?.trim();
  if (!e || !isValidEmail(e) || /[?&#\s]/.test(e)) return null;
  return subject ? `mailto:${e}?subject=${encodeURIComponent(subject)}` : `mailto:${e}`;
}

/** Parámetros de consulta sin vacíos (el api rechaza valores que no reconoce). */
export function cleanParams<T extends Record<string, unknown>>(params: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
