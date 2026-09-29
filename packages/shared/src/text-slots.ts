import { cleanText } from './sanitize';
import { LIMITS } from './limits';

// Todos los textos editables de la plantilla. Se guardan en DjProfile.texts (JSON);
// una clave que falta usa el valor por defecto. Agregar un texto no requiere migración.

export type TextGroup = 'nav' | 'hero' | 'media' | 'artists' | 'events' | 'booking' | 'footer';

export interface TextSlot {
  key: string;
  group: TextGroup;
  label: string;
  default: string;
  max: number;
  multiline?: boolean;
  /** Placeholders permitidos, reemplazados por el servidor. */
  placeholders?: readonly string[];
}

export const PAGE_TEXT_SLOTS = [
  { key: 'navTag', group: 'nav', label: 'Etiqueta junto al nombre', default: 'Booking', max: 20 },
  { key: 'navArtists', group: 'nav', label: 'Menú: artistas', default: 'Artistas', max: 20 },
  { key: 'navEvents', group: 'nav', label: 'Menú: fechas', default: 'Fechas', max: 20 },
  { key: 'navBooking', group: 'nav', label: 'Menú: solicitud', default: 'Solicitud', max: 20 },

  { key: 'heroLabel', group: 'hero', label: 'Etiqueta superior', default: 'DJs', max: 40 },
  { key: 'heroTitle', group: 'hero', label: 'Título principal', default: 'Electronic club show', max: 60 },
  { key: 'heroSubtitle', group: 'hero', label: 'Descripción', default: '', max: 600, multiline: true },
  { key: 'heroNote', group: 'hero', label: 'Nota bajo los botones', default: '', max: 160 },
  { key: 'heroPrimaryCta', group: 'hero', label: 'Botón de WhatsApp', default: 'WhatsApp Booking', max: 30 },
  {
    key: 'heroWhatsappMessage',
    group: 'hero',
    label: 'Mensaje prellenado de WhatsApp',
    default: 'Hola, quiero cotizar booking',
    max: 200,
  },
  { key: 'heroSecondaryCta', group: 'hero', label: 'Botón secundario', default: 'Enviar solicitud', max: 30 },
  { key: 'heroPhotoAlt', group: 'hero', label: 'Descripción de la foto principal', default: '', max: 125 },
  { key: 'heroCaptionLeft', group: 'hero', label: 'Texto sobre la foto (izquierda)', default: 'Live club show', max: 40 },
  { key: 'heroCaptionRight', group: 'hero', label: 'Texto sobre la foto (derecha)', default: '', max: 40 },

  { key: 'riderCardLabel', group: 'media', label: 'Tarjeta rider: etiqueta', default: 'Live Setup', max: 24 },
  { key: 'riderCardTitle', group: 'media', label: 'Tarjeta rider: título', default: 'Specs', max: 30 },
  { key: 'riderButton', group: 'media', label: 'Tarjeta rider: botón', default: 'Rider técnico', max: 24 },
  { key: 'riderTitle', group: 'media', label: 'Título del rider', default: '', max: 40 },
  { key: 'galleryCardLabel', group: 'media', label: 'Tarjeta fotos: etiqueta', default: 'Media', max: 24 },
  { key: 'galleryCardTitle', group: 'media', label: 'Tarjeta fotos: título', default: 'Highlights', max: 30 },
  { key: 'galleryButton', group: 'media', label: 'Tarjeta fotos: botón', default: 'Photos', max: 24 },
  { key: 'galleryTitle', group: 'media', label: 'Título de la galería', default: 'Galería', max: 40 },

  { key: 'artistsTitle', group: 'artists', label: 'Título de la sección', default: 'Artistas', max: 40 },
  { key: 'artistsSubtitle', group: 'artists', label: 'Subtítulo de la sección', default: '', max: 160 },

  { key: 'eventsTitle', group: 'events', label: 'Título de la sección', default: 'Fechas', max: 40 },
  {
    key: 'eventsSubtitle',
    group: 'events',
    label: 'Subtítulo de la sección',
    default: 'Agenda actual y espacios abiertos para nuevas reservas.',
    max: 160,
  },
  { key: 'eventsNote', group: 'events', label: 'Nota al final', default: '', max: 240 },
  {
    key: 'eventsEmpty',
    group: 'events',
    label: 'Texto sin fechas',
    default: 'Pronto anunciaremos nuevas fechas.',
    max: 120,
  },
  { key: 'eventCtaLabel', group: 'events', label: 'Botón de cada fecha', default: 'Book', max: 20 },
  {
    key: 'eventWhatsappMessage',
    group: 'events',
    label: 'Mensaje de WhatsApp por fecha',
    default: 'Hola, quiero estar en el evento {evento} ({fecha})',
    max: 200,
    placeholders: ['{evento}', '{fecha}'],
  },
  { key: 'openDateLabel', group: 'events', label: 'Fila abierta: etiqueta', default: 'Disponible', max: 20 },
  { key: 'openDateText', group: 'events', label: 'Fila abierta: texto', default: 'Abrir nueva fecha', max: 60 },
  { key: 'openDateCta', group: 'events', label: 'Fila abierta: botón', default: 'Reservar', max: 20 },
  {
    key: 'openDateWhatsappMessage',
    group: 'events',
    label: 'Fila abierta: mensaje de WhatsApp',
    default: 'Hola, quiero reservar una fecha',
    max: 200,
  },

  { key: 'bookingTitle', group: 'booking', label: 'Título del formulario', default: 'Solicitud de booking', max: 40 },
  {
    key: 'bookingSubtitle',
    group: 'booking',
    label: 'Subtítulo del formulario',
    default: 'Completa los datos básicos y te responderemos con la propuesta y condiciones.',
    max: 200,
  },
  { key: 'bookingSubmit', group: 'booking', label: 'Botón de enviar', default: 'Enviar solicitud', max: 30 },
  { key: 'bookingWhatsappButton', group: 'booking', label: 'Botón de WhatsApp', default: 'Hablar por WhatsApp', max: 30 },
  {
    key: 'bookingWhatsappMessage',
    group: 'booking',
    label: 'Mensaje del botón de WhatsApp',
    default: 'Hola, quiero booking',
    max: 200,
  },
  {
    key: 'bookingDisclaimer',
    group: 'booking',
    label: 'Nota bajo el formulario',
    // Informativo, no un consentimiento: la autorización es solo la casilla. Un "al enviar
    // aceptas…" es consentimiento por clic y no vale (Res. SIC 76538).
    default: 'Te contactaremos por email o WhatsApp con info de disponibilidad, cachet y rider técnico.',
    max: 300,
  },
  {
    key: 'bookingSuccess',
    group: 'booking',
    label: 'Mensaje de éxito',
    default: '¡Solicitud enviada! Ahora te llevamos a WhatsApp para continuar.',
    max: 200,
  },

  { key: 'footerText', group: 'footer', label: 'Texto del pie', default: '', max: 80 },
] as const satisfies readonly TextSlot[];

export type TextSlotKey = (typeof PAGE_TEXT_SLOTS)[number]['key'];
export type PageTexts = Record<TextSlotKey, string>;

const SLOT_BY_KEY: ReadonlyMap<string, TextSlot> = new Map(PAGE_TEXT_SLOTS.map((s) => [s.key, s as TextSlot]));

export function getTextSlot(key: string): TextSlot | undefined {
  return SLOT_BY_KEY.get(key);
}

/** Combina lo guardado con los valores por defecto. Los vacíos derivados usan el nombre del DJ. */
export function resolveTexts(stored: unknown, displayName: string): PageTexts {
  const src = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out = Object.create(null) as PageTexts;
  for (const slot of PAGE_TEXT_SLOTS) {
    const v = Object.prototype.hasOwnProperty.call(src, slot.key) ? src[slot.key] : undefined;
    out[slot.key] = typeof v === 'string' ? v : slot.default;
  }
  if (!out.heroPhotoAlt) out.heroPhotoAlt = `Show de ${displayName}`;
  if (!out.footerText) out.footerText = `${displayName} — Booking`;
  return out;
}

export interface TextsValidation {
  texts: Partial<PageTexts>;
  errors: Record<string, 'UNKNOWN_KEY' | 'TOO_LONG' | 'NOT_STRING' | 'BAD_PLACEHOLDER'>;
}

/**
 * Valida un parche de textos. Solo se aceptan claves del catálogo (se recorre el catálogo,
 * nunca el objeto recibido, para no dejar pasar __proto__ ni claves inventadas).
 */
export function validateTexts(input: unknown): TextsValidation {
  const errors: TextsValidation['errors'] = {};
  const texts = Object.create(null) as Partial<PageTexts>;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { texts, errors: { _: 'NOT_STRING' } };
  }
  const src = input as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!SLOT_BY_KEY.has(key)) errors[key] = 'UNKNOWN_KEY';
  }
  for (const slot of PAGE_TEXT_SLOTS as readonly TextSlot[]) {
    if (!Object.prototype.hasOwnProperty.call(src, slot.key)) continue;
    const raw = src[slot.key];
    if (typeof raw !== 'string') {
      errors[slot.key] = 'NOT_STRING';
      continue;
    }
    const value = cleanText(raw, { multiline: slot.multiline, maxLines: LIMITS.texts.multilineMaxLines });
    if ([...value].length > slot.max) {
      errors[slot.key] = 'TOO_LONG';
      continue;
    }
    const braces = value.match(/\{[^}]*\}/g) ?? [];
    if (braces.some((b) => !slot.placeholders?.includes(b))) {
      errors[slot.key] = 'BAD_PLACEHOLDER';
      continue;
    }
    (texts as Record<string, string>)[slot.key] = value;
  }
  return { texts, errors };
}
