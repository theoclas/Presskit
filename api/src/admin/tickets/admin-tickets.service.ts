import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { todayBogota, type Paginated, type TicketDto } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnlyToDb } from '../../public/date-only';
import { actorFields, type AdminActor } from '../admin-actor';
import { pageArgs } from '../admin-common';
import { matchingBookingsWhere } from '../legal/legal-record-view';
import type { ListTicketsQuery, UpdateTicketBody } from './admin-tickets.dto';
import {
  CLOSED_TICKET_STATUSES,
  OPEN_TICKET_STATUSES,
  cleanResolution,
  isClosed,
  splitPage,
  ticketSelect,
  toTicketDto,
} from './ticket-view';

const NOT_FOUND = 'Ticket no encontrado.';

/** Orden dentro de cada tramo: el que vence antes primero; empates por antigüedad. */
const ORDER: Prisma.TicketOrderByWithRelationInput[] = [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

/** Bandeja de PQRS, reportes de perfil y solicitudes de datos (art. 53). */
@Injectable()
export class AdminTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Vencidos primero (abiertos con dueAt anterior a hoy) y después el resto, ambos por dueAt.
   * El spam (honeypot o topes) no sale salvo con spam=true, que muestra solo el spam.
   */
  async list(q: ListTicketsQuery): Promise<Paginated<TicketDto>> {
    const { page, pageSize, skip, take } = pageArgs(q);
    const today = dateOnlyToDb(todayBogota());
    const base: Prisma.TicketWhereInput = {
      isSpam: q.spam === 'true',
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
    };
    const overdue: Prisma.TicketWhereInput = { AND: [base, { status: { in: OPEN_TICKET_STATUSES }, dueAt: { lt: today } }] };
    const rest: Prisma.TicketWhereInput = {
      AND: [base, { OR: [{ status: { in: CLOSED_TICKET_STATUSES } }, { dueAt: { gte: today } }] }],
    };

    const [overdueCount, restCount] = await Promise.all([
      this.prisma.ticket.count({ where: overdue }),
      this.prisma.ticket.count({ where: rest }),
    ]);
    const slices = splitPage(skip, take, overdueCount);
    const [first, second] = await Promise.all([
      slices.first
        ? this.prisma.ticket.findMany({ where: overdue, select: ticketSelect, orderBy: ORDER, ...slices.first })
        : Promise.resolve([]),
      slices.rest
        ? this.prisma.ticket.findMany({ where: rest, select: ticketSelect, orderBy: ORDER, ...slices.rest })
        : Promise.resolve([]),
    ]);
    const now = new Date();
    return {
      items: [...first, ...second].map((row) => toTicketDto(row, now)),
      page,
      pageSize,
      total: overdueCount + restCount,
    };
  }

  async detail(id: string): Promise<TicketDto> {
    const row = await this.prisma.ticket.findUnique({ where: { id }, select: ticketSelect });
    if (!row) throw Errors.notFound(NOT_FOUND);
    const dto = toTicketDto(row);
    // Solicitud de datos de un DJ: ¿quien pide le mandó una solicitud de booking? (solo el conteo)
    if (row.type === 'SOLICITUD_DATOS_DJ') {
      dto.matchingBookings = row.profile
        ? await this.prisma.bookingRequest.count({ where: matchingBookingsWhere(row.profile.id, row.email) })
        : null;
    }
    return dto;
  }

  /**
   * Cambia el estado, la respuesta y/o la marca de spam. Al cerrar (RESOLVED/REJECTED) se fija
   * resolvedAt una sola vez; al reabrir se borra. El admin que lo toca queda como responsable.
   * Desmarcar el spam no envía el aviso que no salió: quien lo desmarca ya lo está viendo.
   */
  async update(actor: AdminActor, id: string, body: UpdateTicketBody): Promise<TicketDto> {
    const resolution = body.resolution === undefined ? undefined : cleanResolution(body.resolution);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.ticket.findUnique({
        where: { id },
        select: { id: true, status: true, resolvedAt: true, resolution: true, profileId: true, isSpam: true },
      });
      if (!current) throw Errors.notFound(NOT_FOUND);

      const now = new Date();
      const closing = isClosed(body.status);
      const resolvedAt = closing ? (isClosed(current.status) && current.resolvedAt ? current.resolvedAt : now) : null;
      const row = await tx.ticket.update({
        where: { id: current.id },
        data: {
          status: body.status,
          resolvedAt,
          handledById: actor.id,
          ...(resolution !== undefined ? { resolution } : {}),
          ...(body.isSpam !== undefined ? { isSpam: body.isSpam } : {}),
        },
        select: ticketSelect,
      });
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.ticket.update',
          targetType: 'Ticket',
          targetId: current.id,
          profileId: current.profileId,
          // Sin el texto de la respuesta: solo si cambió.
          metadata: {
            from: current.status,
            to: body.status,
            resolutionChanged: resolution !== undefined && resolution !== current.resolution,
            ...(body.isSpam !== undefined && body.isSpam !== current.isSpam ? { isSpam: body.isSpam } : {}),
          },
        },
        tx,
      );
      return toTicketDto(row, now);
    });
  }
}
