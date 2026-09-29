// Espejo de los enums de Prisma. La web nunca importa @prisma/client, así que los valores
// viven aquí y un test del api comprueba que coincidan con schema.prisma.

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROFILE_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const PALETTE_KEYS = ['SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const SOCIAL_PLATFORM_KEYS = [
  'INSTAGRAM',
  'SOUNDCLOUD',
  'SPOTIFY',
  'TIKTOK',
  'YOUTUBE',
  'FACEBOOK',
  'BEATPORT',
  'MIXCLOUD',
  'RESIDENT_ADVISOR',
  'X',
  'WHATSAPP',
  'APPLE_MUSIC',
  'BANDCAMP',
  'TWITCH',
  'THREADS',
  'LINKTREE',
  'WEBSITE',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORM_KEYS)[number];

export const MEDIA_KINDS = ['HERO', 'CARD', 'MEMBER', 'GALLERY', 'FLYER'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const EVENT_CTA_TYPES = ['WHATSAPP', 'URL', 'NONE'] as const;
export type EventCtaType = (typeof EVENT_CTA_TYPES)[number];

export const BOOKING_STATUSES = ['NEW', 'READ', 'ARCHIVED', 'SPAM'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const TICKET_TYPES = ['PQRS_CONSULTA', 'PQRS_RECLAMO', 'REPORTE_PERFIL', 'SOLICITUD_DATOS_DJ'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const DOC_TYPES = ['CC', 'CE', 'NIT', 'PASAPORTE', 'PPT'] as const;
export type DocType = (typeof DOC_TYPES)[number];
