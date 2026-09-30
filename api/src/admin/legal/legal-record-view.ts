import type { Prisma, TicketStatus, TicketType } from '@prisma/client';
import {
  LIMITS,
  type AdminLegalRecordDto,
  type AdminLegalRecordListItemDto,
  type DocType,
  type LegalRecordState,
} from '@fersua/shared';
import { Errors } from '../../common/errors';
import { isoOrNull } from '../admin-common';

// Registros del art. 53 (DjLegalInfo) para el admin (M4): la lista sin documento, dirección ni
// teléfonos; el detalle completo (auditado); y la respuesta para entregar los datos del DJ a
// quien los pidió en un ticket SOLICITUD_DATOS_DJ (docs/diseno/11 §5.1, DATOS_OFERENTE).

export const legalRecordListSelect = {
  id: true,
  profileId: true,
  profile: { select: { id: true, slug: true, displayName: true, status: true } },
  legalName: true,
  closedAt: true,
  closedProfileSlug: true,
  closedDisplayName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DjLegalInfoSelect;

export const legalRecordDetailSelect = {
  ...legalRecordListSelect,
  docType: true,
  docNumber: true,
  address: true,
  phones: true,
} satisfies Prisma.DjLegalInfoSelect;

type ListRow = Prisma.DjLegalInfoGetPayload<{ select: typeof legalRecordListSelect }>;
export type LegalRecordDetailRow = Prisma.DjLegalInfoGetPayload<{ select: typeof legalRecordDetailSelect }>;

/**
 * Solicitudes de booking a un DJ con el mismo correo que el ticket: la señal de que quien pide
 * sus datos lo contrató (art. 53, docs/diseno/11 §5.1). La comparación no distingue mayúsculas
 * (collation de MySQL). Se usa solo para contar.
 */
export function matchingBookingsWhere(profileId: string, email: string): Prisma.BookingRequestWhereInput {
  return { profileId, contactEmail: email };
}

/** active = unido a un perfil; closed = conservado después de borrar el perfil. */
export function legalRecordStateWhere(state: LegalRecordState | undefined): Prisma.DjLegalInfoWhereInput {
  if (state === 'active') return { profileId: { not: null } };
  if (state === 'closed') return { profileId: null };
  return {};
}

/**
 * Desde cuándo lo borra la purga diaria (LegalRetentionJob): el mismo corte de meses en UTC
 * que legalRetentionCutoff, contado hacia adelante desde el cierre.
 */
export function legalPurgeAt(closedAt: Date, months: number = LIMITS.retention.legalInfoMonths): Date {
  const at = new Date(closedAt);
  at.setUTCMonth(at.getUTCMonth() + months);
  return at;
}

export function toLegalRecordListItem(row: ListRow): AdminLegalRecordListItemDto {
  const active = row.profile !== null;
  return {
    id: row.id,
    state: active ? 'active' : 'closed',
    profileId: row.profile?.id ?? null,
    slug: row.profile?.slug ?? row.closedProfileSlug,
    displayName: row.profile?.displayName ?? row.closedDisplayName,
    profileStatus: row.profile?.status ?? null,
    legalName: row.legalName,
    closedAt: active ? null : isoOrNull(row.closedAt),
    purgeAt: !active && row.closedAt ? legalPurgeAt(row.closedAt).toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLegalRecordDetail(row: LegalRecordDetailRow): AdminLegalRecordDto {
  // phones es JSON de la BD: solo se aceptan textos.
  const phones = Array.isArray(row.phones) ? row.phones.filter((p): p is string => typeof p === 'string') : [];
  return {
    ...toLegalRecordListItem(row),
    docType: row.docType,
    docNumber: row.docNumber,
    address: row.address,
    phones,
  };
}

// ---------------------------------------------------------------- entrega de datos (disclose)

/** Lo que hace falta del ticket para decidir si se pueden entregar los datos. */
export interface DisclosableTicket {
  type: TicketType;
  status: TicketStatus;
  isSpam: boolean;
}

/**
 * Reglas para entregar los datos del DJ desde un ticket (409 si no se cumplen):
 * - solo una SOLICITUD_DATOS_DJ (art. 53): ningún otro tipo de ticket abre el registro;
 * - no si está marcado como spam (primero se desmarca, ya revisado);
 * - no si se rechazó: rechazar es decidir no entregarlos; para cambiar de idea se reabre.
 */
export function assertDisclosable(ticket: DisclosableTicket): void {
  if (ticket.type !== 'SOLICITUD_DATOS_DJ') {
    throw Errors.conflict('TICKET_NOT_DATA_REQUEST', 'Solo se entregan los datos de un DJ en una solicitud de datos (art. 53).');
  }
  if (ticket.isSpam) {
    throw Errors.conflict('TICKET_IS_SPAM', 'Este ticket está marcado como spam. Revísalo y desmárcalo antes de entregar datos.');
  }
  if (ticket.status === 'REJECTED') {
    throw Errors.conflict('TICKET_REJECTED', 'Este ticket está rechazado. Reábrelo si decides entregar los datos.');
  }
}

/** Nombre del documento en la respuesta al solicitante. */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  PPT: 'Permiso por Protección Temporal (PPT)',
};

export interface DisclosureTemplateInput {
  requesterName: string;
  ticketId: string;
  record: AdminLegalRecordDto;
  /** Origen público (PUBLIC_URL) para el enlace de la página del DJ. */
  publicUrl: string;
}

/**
 * Respuesta en texto plano para el solicitante con los datos de identificación del DJ
 * (art. 53 Ley 1480: el portal de contacto debe entregarlos a quien quiera quejarse). La arma
 * el servidor con los datos del registro; la web solo la muestra y el admin la copia.
 */
export function disclosureTemplate({ requesterName, ticketId, record, publicUrl }: DisclosureTemplateInput): string {
  const name = record.displayName ?? record.legalName;
  const url = record.slug ? `${publicUrl.replace(/\/+$/, '')}/${record.slug}` : null;
  const artist =
    record.state === 'active'
      ? `${name}${url ? ` (su página es ${url})` : ''}`
      : `${name}${url ? `, cuya página (${url})` : ', cuya página'} ya no está publicada en Fersua Studio`;
  const phones = record.phones.length ? record.phones.join(' / ') : 'no registrado';
  return [
    `Hola, ${requesterName}:`,
    '',
    `Respondemos tu solicitud con radicado ${ticketId}.`,
    '',
    'Fersua Studio es un portal de contacto (artículo 53 de la Ley 1480 de 2011, Estatuto del Consumidor): ' +
      'no vende ni presta los servicios de los artistas, no fija precios y no recibe pagos. ' +
      `Como lo exige esa norma, te entregamos los datos de identificación del artista ${artist}, ` +
      'para que puedas presentarle directamente tu queja o reclamo:',
    '',
    `- Nombre o razón social: ${record.legalName}`,
    `- Documento de identificación: ${DOC_TYPE_LABELS[record.docType]} ${record.docNumber}`,
    `- Dirección: ${record.address}`,
    `- ${record.phones.length > 1 ? 'Teléfonos' : 'Teléfono'}: ${phones}`,
    '',
    'Usa estos datos solo para tramitar tu queja o reclamo sobre el servicio que contrataste. ' +
      'Si el artista no te responde, puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).',
    '',
    'Cordialmente,',
    'Fersua Studio',
  ].join('\n');
}
