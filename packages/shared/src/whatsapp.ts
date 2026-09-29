import { formatLongDate } from './dates';
import { LIMITS } from './limits';
import { sliceText, toWellFormedText } from './sanitize';

// Los enlaces de WhatsApp siempre se arman aquí (en el servidor), con encodeURIComponent.
// Así no se repite el bug de la página vieja que mandaba '{nombre del evento}' literal.

export const WA_URL_RE = /^https:\/\/wa\.me\/\d{8,15}(\?text=[^#\s]*)?$/;

export function normalizeWhatsappNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length < LIMITS.profile.whatsappDigitsMin || digits.length > LIMITS.profile.whatsappDigitsMax) {
    return null;
  }
  return digits;
}

/**
 * Nunca lanza: encodeURIComponent falla con una mitad suelta de un emoji, así que el texto se
 * deja bien formado y se corta sin partir pares. Un error aquí dejaría sin enlace (o en 500)
 * una solicitud ya guardada.
 */
export function buildWaUrl(number: string, text?: string): string {
  const base = `https://wa.me/${number}`;
  const t = text ? toWellFormedText(text).trim() : '';
  return t ? `${base}?text=${encodeURIComponent(sliceText(t, LIMITS.booking.whatsappMessageMax))}` : base;
}

/**
 * Reemplaza {evento} y {fecha}; cualquier otro placeholder se elimina. Una sola pasada y con
 * función de reemplazo: '$&' o "$'" en el nombre del evento no se interpretan, y un '{x}' que
 * venga en el lugar no se confunde con un placeholder de la plantilla.
 */
export function fillEventMessage(template: string, vars: { evento: string; fecha: string }): string {
  return template
    .replace(/\{([^}]*)\}/g, (_m, name: string) => (name === 'evento' ? vars.evento : name === 'fecha' ? vars.fecha : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function eventWhatsappText(template: string, event: { title?: string | null; venue: string; date: string }): string {
  return fillEventMessage(template, { evento: event.title?.trim() || event.venue, fecha: formatLongDate(event.date) });
}

/** Resumen de una solicitud de booking para abrir WhatsApp tras guardarla. */
export function buildBookingSummary(opts: {
  title: string;
  displayName: string;
  rows: { label: string; value: string }[];
  pageUrl: string;
}): string {
  const lines = [`*${opts.title} — ${opts.displayName}*`, ''];
  for (const r of opts.rows) {
    const value = r.value.length > 700 ? `${sliceText(r.value, 700)}…` : r.value;
    lines.push(`*${r.label}:* ${value}`);
  }
  lines.push('', `Enviado desde ${opts.pageUrl}`);
  const text = lines.join('\n');
  const max = LIMITS.booking.whatsappMessageMax;
  return text.length > max ? `${sliceText(text, max - 1)}…` : text;
}
