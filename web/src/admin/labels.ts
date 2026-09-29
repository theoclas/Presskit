import type { BookingStatus, ProfileStatus, TicketStatus, TicketType, UserRole, UserStatus } from '@fersua/shared';

// Textos y colores (Tag de AntD) de los enums que muestra el admin.

type Labeled = { label: string; color: string };

export const PROFILE_STATUS: Record<ProfileStatus, Labeled> = {
  DRAFT: { label: 'Borrador', color: 'default' },
  PENDING_REVIEW: { label: 'En revisión', color: 'gold' },
  APPROVED: { label: 'Aprobado', color: 'green' },
  REJECTED: { label: 'Rechazado', color: 'red' },
  SUSPENDED: { label: 'Suspendido', color: 'volcano' },
};

export const BOOKING_STATUS: Record<BookingStatus, Labeled> = {
  NEW: { label: 'Nueva', color: 'orange' },
  READ: { label: 'Leída', color: 'blue' },
  ARCHIVED: { label: 'Archivada', color: 'default' },
  SPAM: { label: 'Spam', color: 'red' },
};

export const TICKET_STATUS: Record<TicketStatus, Labeled> = {
  OPEN: { label: 'Abierta', color: 'orange' },
  IN_PROGRESS: { label: 'En trámite', color: 'blue' },
  RESOLVED: { label: 'Resuelta', color: 'green' },
  REJECTED: { label: 'Rechazada', color: 'default' },
};

export const TICKET_TYPE: Record<TicketType, string> = {
  PQRS_CONSULTA: 'Consulta de datos',
  PQRS_RECLAMO: 'Reclamo de datos',
  REPORTE_PERFIL: 'Reporte de perfil',
  SOLICITUD_DATOS_DJ: 'Datos de un DJ (queja)',
};

export const USER_STATUS: Record<UserStatus, Labeled> = {
  ACTIVE: { label: 'Activa', color: 'green' },
  SUSPENDED: { label: 'Suspendida', color: 'red' },
};

export const USER_ROLE: Record<UserRole, string> = {
  USER: 'DJ',
  ADMIN: 'Administrador',
};

/** Opciones de <Select> a partir de uno de los mapas de arriba. */
export function optionsOf<K extends string>(map: Record<K, Labeled | string>): { value: K; label: string }[] {
  return (Object.keys(map) as K[]).map((value) => {
    const v = map[value];
    return { value, label: typeof v === 'string' ? v : v.label };
  });
}
