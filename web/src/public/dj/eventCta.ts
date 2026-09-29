import { formatLongDate, formatShowDate, type PublicEventDto } from '@fersua/shared';
import { safeHttpsUrl } from '../../lib/safeUrl';
import { isWhatsappUrl } from '../../lib/whatsapp';

/** URL del botón de una fecha, solo si es segura (wa.me para WHATSAPP, https para URL). */
export function eventCtaHref(cta: PublicEventDto['cta']): string | null {
  if (!cta || cta.type === 'NONE') return null;
  if (cta.type === 'WHATSAPP') return isWhatsappUrl(cta.url) ? cta.url : null;
  return safeHttpsUrl(cta.url);
}

/** '14 NOV' (como la plantilla). Si el api no lo manda, se arma desde la fecha. */
export function eventShortDate(event: Pick<PublicEventDto, 'date' | 'dateLabel'>): string {
  return event.dateLabel?.trim() || formatShowDate(event.date);
}

/** '14 de noviembre de 2026, 22:00' para lectores de pantalla y el diálogo del flyer. */
export function eventLongDate(event: Pick<PublicEventDto, 'date' | 'time'>): string {
  return event.time ? `${formatLongDate(event.date)}, ${event.time}` : formatLongDate(event.date);
}

export function eventPlace(event: Pick<PublicEventDto, 'title' | 'venue' | 'city'>): string {
  const venue = event.city ? `${event.venue} · ${event.city}` : event.venue;
  return event.title ? `${event.title} · ${venue}` : venue;
}
