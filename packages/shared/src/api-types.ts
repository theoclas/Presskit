// Contrato de las respuestas del api que consume la web. El api las construye,
// la web solo las pinta: todas las URLs (WhatsApp, imágenes, CTAs) vienen armadas.

import type { EventCtaType, PaletteKey, ProfileStatus, SocialPlatform, TicketType } from './enums';
import type { ResolvedFormField } from './form-config';
import type { ImageDto } from './media';
import type { PageTexts } from './text-slots';

export interface GenreDto {
  slug: string;
  name: string;
}

/** GET /api/public/genres: cada género con cuántos perfiles visibles lo usan. */
export interface GenreCountDto extends GenreDto {
  count: number;
}

export interface SocialLinkDto {
  platform: SocialPlatform;
  label: string;
  url: string;
}

export interface PublicEventDto {
  id: string;
  /** 'YYYY-MM-DD' (Bogotá). */
  date: string;
  /** '14 NOV'. */
  dateLabel: string;
  time: string | null;
  title: string | null;
  venue: string;
  city: string | null;
  flyer: ImageDto | null;
  cta: { type: EventCtaType; label: string; url: string } | null;
}

export interface PublicMemberDto {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  photo: ImageDto | null;
  socials: SocialLinkDto[];
}

export interface PublicDjCardDto {
  slug: string;
  displayName: string;
  tagline: string | null;
  city: string | null;
  palette: PaletteKey;
  featured: boolean;
  /** Recorte 4:5 de la tarjeta (o la foto del hero si no hay). */
  cardImage: ImageDto | null;
  /** Foto horizontal del hero, solo en los destacados (la usa el hero del index); null en los demás. */
  heroImage: ImageDto | null;
  genres: GenreDto[];
  nextEvent: { date: string; dateLabel: string; venue: string } | null;
}

export interface PublicDjProfileDto {
  slug: string;
  displayName: string;
  palette: PaletteKey;
  texts: PageTexts;
  heroImage: ImageDto | null;
  genres: GenreDto[];
  socials: SocialLinkDto[];
  members: PublicMemberDto[];
  riderItems: { name: string; note: string | null }[];
  gallery: ImageDto[];
  events: PublicEventDto[];
  show: { gallery: boolean; rider: boolean; events: boolean; openDateRow: boolean; form: boolean };
  whatsapp: {
    /** Botón principal del hero. */
    heroUrl: string | null;
    /** Fila "Disponible / Reservar". */
    openDateUrl: string | null;
    /** Botón "Hablar por WhatsApp" del formulario. */
    bookingUrl: string | null;
  };
  bookingForm: {
    fields: ResolvedFormField[];
    consentText: string;
    consentVersion: string;
    privacyUrl: string;
    portalNotice: string;
  };
  /** Solo presente en la vista previa del dueño/admin. */
  preview?: { status: ProfileStatus };
  updatedAt: string;
}

export interface BookingTokenDto {
  token: string;
}

export interface BookingSubmitDto {
  fields: Record<string, string>;
  consent: true;
  token: string;
  /** Honeypot: debe llegar vacío. */
  hp_x7?: string;
}

export interface BookingSubmitResultDto {
  id: string;
  whatsappUrl: string | null;
}

/**
 * GET /api/public/tickets/token (no-store). Token de un solo uso del formulario de PQRS y
 * reportes (M4): el mismo esquema que el de booking, pero no sirve para booking ni al revés.
 */
export interface TicketTokenDto {
  token: string;
}

export interface TicketSubmitDto {
  type: TicketType;
  name: string;
  email: string;
  phone?: string;
  /** Slug del perfil cuando es un reporte o una solicitud de datos de un DJ. */
  profileSlug?: string;
  subject: string;
  message: string;
  consent: true;
  /**
   * De GET /api/public/tickets/token (M4). Vale desde 2 s hasta 2 h después de emitido y una
   * sola vez: 400 FORM_TOKEN_INVALID / FORM_TOO_FAST / FORM_EXPIRED / FORM_TOKEN_USED.
   */
  token: string;
  /** Honeypot: debe llegar vacío. */
  hp_x7?: string;
}

/** Respuesta de POST /api/public/tickets. */
export interface TicketSubmitResultDto {
  /** Número de radicado. */
  id: string;
  /** Fecha límite de respuesta, 'YYYY-MM-DD' (Bogotá). */
  dueDate: string;
}

export interface ApiErrorDto {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, string>;
}
