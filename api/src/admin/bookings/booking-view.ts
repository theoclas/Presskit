import type { Prisma } from '@prisma/client';
import type { BookingDetailDto, BookingListItemDto, BookingStatus } from '@fersua/shared';
import { dateOnlyFromDb } from '../../public/date-only';

// Forma de las solicitudes para las bandejas. El admin la usa ahora; la bandeja del dueño (M3)
// devuelve exactamente lo mismo, así que conviene reutilizar estas funciones.

export const bookingListSelect = {
  id: true,
  profile: { select: { id: true, slug: true, displayName: true } },
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  eventDate: true,
  status: true,
  createdAt: true,
} satisfies Prisma.BookingRequestSelect;

export const bookingDetailSelect = {
  ...bookingListSelect,
  payload: true,
  consentAt: true,
  consentVersion: true,
  readAt: true,
} satisfies Prisma.BookingRequestSelect;

type ListRow = Prisma.BookingRequestGetPayload<{ select: typeof bookingListSelect }>;
type DetailRow = Prisma.BookingRequestGetPayload<{ select: typeof bookingDetailSelect }>;

export function toBookingListItem(row: ListRow): BookingListItemDto {
  return {
    id: row.id,
    profile: { id: row.profile.id, slug: row.profile.slug, displayName: row.profile.displayName },
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    eventDate: row.eventDate ? dateOnlyFromDb(row.eventDate) : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Filas del payload guardado ([{ key, label, value }] con las etiquetas vigentes al enviar).
 * Es JSON de la BD: se revisa la forma y se descarta lo que no sea texto, nunca se confía.
 */
export function payloadFields(payload: unknown): BookingDetailDto['fields'] {
  if (!Array.isArray(payload)) return [];
  const out: BookingDetailDto['fields'] = [];
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue;
    const { key, label, value } = row as Record<string, unknown>;
    if (typeof key !== 'string' || typeof label !== 'string' || typeof value !== 'string') continue;
    out.push({ key, label, value });
  }
  return out;
}

export function toBookingDetail(row: DetailRow): BookingDetailDto {
  return {
    ...toBookingListItem(row),
    fields: payloadFields(row.payload),
    consentAt: row.consentAt.toISOString(),
    consentVersion: row.consentVersion,
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

/**
 * Columnas que acompañan un cambio de estado:
 * - NEW: vuelve a "sin leer".
 * - READ / SPAM: marca leída si no lo estaba y sale del archivo.
 * - ARCHIVED: leída y archivada (conserva la fecha si ya estaba archivada).
 */
export function statusChange(
  next: BookingStatus,
  current: { readAt: Date | null; archivedAt: Date | null },
  now: Date,
): { status: BookingStatus; readAt: Date | null; archivedAt: Date | null } {
  switch (next) {
    case 'NEW':
      return { status: next, readAt: null, archivedAt: null };
    case 'ARCHIVED':
      return { status: next, readAt: current.readAt ?? now, archivedAt: current.archivedAt ?? now };
    case 'READ':
    case 'SPAM':
      return { status: next, readAt: current.readAt ?? now, archivedAt: null };
  }
}
