import { formatLongDate } from './dates';
import { LIMITS } from './limits';

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

export function buildWaUrl(number: string, text?: string): string {
  const base = `https://wa.me/${number}`;
  const t = text?.trim();
  return t ? `${base}?text=${encodeURIComponent(t.slice(0, LIMITS.booking.whatsappMessageMax))}` : base;
}

/** Reemplaza {evento} y {fecha}. Cualquier otro placeholder se elimina. */
export function fillEventMessage(template: string, vars: { evento: string; fecha: string }): string {
  return template
    .replace(/\{evento\}/g, vars.evento)
    .replace(/\{fecha\}/g, vars.fecha)
    .replace(/\{[^}]*\}/g, '')
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
    const value = r.value.length > 700 ? `${r.value.slice(0, 700)}…` : r.value;
    lines.push(`*${r.label}:* ${value}`);
  }
  lines.push('', `Enviado desde ${opts.pageUrl}`);
  const text = lines.join('\n');
  return text.length > LIMITS.booking.whatsappMessageMax ? `${text.slice(0, LIMITS.booking.whatsappMessageMax - 1)}…` : text;
}
