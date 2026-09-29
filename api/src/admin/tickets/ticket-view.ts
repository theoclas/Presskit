import type { Prisma, TicketStatus } from '@prisma/client';
import { LIMITS, cleanText, isWellFormedText, todayBogota, type TicketDto } from '@fersua/shared';
import { Errors } from '../../common/errors';
import { dateOnlyFromDb } from '../../public/date-only';
import { businessDaysLeft } from '../business-days';

export const OPEN_TICKET_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS'];
export const CLOSED_TICKET_STATUSES: TicketStatus[] = ['RESOLVED', 'REJECTED'];

export function isClosed(status: TicketStatus): boolean {
  return CLOSED_TICKET_STATUSES.includes(status);
}

export const ticketSelect = {
  id: true,
  type: true,
  status: true,
  profile: { select: { id: true, slug: true, displayName: true } },
  profileSlug: true,
  name: true,
  email: true,
  phone: true,
  subject: true,
  message: true,
  dueAt: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

/**
 * businessDaysLeft: en un ticket abierto se cuenta desde hoy (Bogotá). En uno cerrado se
 * congela en el día en que se cerró, así el número dice si se respondió a tiempo (≥ 0) o
 * tarde (< 0) en vez de seguir bajando para siempre.
 */
export function toTicketDto(row: TicketRow, now: Date = new Date()): TicketDto {
  const due = dateOnlyFromDb(row.dueAt);
  const reference = isClosed(row.status) && row.resolvedAt ? row.resolvedAt : now;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    profile: row.profile ? { id: row.profile.id, slug: row.profile.slug, displayName: row.profile.displayName } : null,
    profileSlug: row.profileSlug,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    dueAt: due,
    businessDaysLeft: businessDaysLeft(todayBogota(reference), due),
    resolution: row.resolution,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Respuesta del admin al ticket: texto plano multilínea, máx. LIMITS.ticket.resolutionMax (3000)
 * después de limpiar. '' o null la borran. Se rechaza en vez de recortar: es un texto legal.
 */
export function cleanResolution(raw: string | null): string | null {
  if (raw === null) return null;
  if (!isWellFormedText(raw)) throw Errors.validation({ resolution: 'INVALID' });
  const value = cleanText(raw, { multiline: true });
  if (!value) return null;
  if ([...value].length > LIMITS.ticket.resolutionMax) {
    throw Errors.validation({ resolution: 'TOO_LONG' }, `La respuesta admite máximo ${LIMITS.ticket.resolutionMax} caracteres.`);
  }
  return value;
}

export interface Slice {
  skip: number;
  take: number;
}

/**
 * La lista va en dos tramos: primero los vencidos y luego el resto, cada uno por dueAt.
 * Dada la página pedida (skip/take sobre la lista completa) y cuántos vencidos hay, devuelve
 * qué pedir de cada tramo. Así se pagina en la BD sin ordenar por una expresión calculada.
 */
export function splitPage(skip: number, take: number, firstCount: number): { first: Slice | null; rest: Slice | null } {
  const firstTake = Math.max(0, Math.min(take, firstCount - skip));
  const first = firstTake > 0 ? { skip, take: firstTake } : null;
  const restTake = take - firstTake;
  const rest = restTake > 0 ? { skip: Math.max(0, skip - firstCount), take: restTake } : null;
  return { first, rest };
}
