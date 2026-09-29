import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BookingDetailDto, BookingListItemDto, Paginated } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { actorFields, type AdminActor } from '../admin-actor';
import { createdAtRange, pageArgs, searchTerm } from '../admin-common';
import type { ListBookingsQuery, UpdateBookingBody } from './admin-bookings.dto';
import { bookingDetailSelect, bookingListSelect, statusChange, toBookingDetail, toBookingListItem } from './booking-view';

const NOT_FOUND = 'Solicitud no encontrada.';
const VIEW_ACTION = 'admin.booking.view';
const VIEW_AUDIT_WINDOW_MS = 10 * 60 * 1000;

/** Bandeja global de solicitudes de booking (todas las páginas). */
@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListBookingsQuery): Promise<Paginated<BookingListItemDto>> {
    const { page, pageSize, skip, take } = pageArgs(q);
    const term = searchTerm(q.q);
    const range = createdAtRange(q);
    const where: Prisma.BookingRequestWhereInput = {
      ...(q.profileId ? { profileId: q.profileId } : {}),
      status: q.status ?? { not: 'SPAM' },
      ...(term
        ? {
            OR: [
              { contactName: { contains: term } },
              { contactEmail: { contains: term } },
              { contactPhone: { contains: term } },
            ],
          }
        : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        select: bookingListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    return { items: rows.map(toBookingListItem), page, pageSize, total };
  }

  /**
   * Ver el detalle (datos personales del cliente de un DJ) queda auditado. No la marca leída:
   * que el admin la abra no significa que el DJ la haya visto.
   */
  async detail(actor: AdminActor, id: string): Promise<BookingDetailDto> {
    const row = await this.prisma.bookingRequest.findUnique({ where: { id }, select: bookingDetailSelect });
    if (!row) throw Errors.notFound(NOT_FOUND);
    // Una fila por vista y no por cada refetch de la web (foco de ventana, reintentos): si el
    // mismo admin ya la vio hace menos de 10 minutos, no se repite.
    const recent = await this.prisma.auditLog.findFirst({
      where: {
        action: VIEW_ACTION,
        targetType: 'BookingRequest',
        targetId: row.id,
        actorId: actor.id,
        createdAt: { gte: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (!recent) {
      await this.audit.record({
        ...actorFields(actor),
        action: VIEW_ACTION,
        targetType: 'BookingRequest',
        targetId: row.id,
        profileId: row.profile.id,
      });
    }
    return toBookingDetail(row);
  }

  async updateStatus(actor: AdminActor, id: string, body: UpdateBookingBody): Promise<BookingDetailDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.bookingRequest.findUnique({
        where: { id },
        select: { id: true, profileId: true, status: true, readAt: true, archivedAt: true },
      });
      if (!current) throw Errors.notFound(NOT_FOUND);
      const change = statusChange(body.status, current, new Date());
      const row = await tx.bookingRequest.update({
        where: { id: current.id },
        data: { status: change.status, readAt: change.readAt, archivedAt: change.archivedAt },
        select: bookingDetailSelect,
      });
      if (current.status !== change.status) {
        await this.audit.record(
          {
            ...actorFields(actor),
            action: 'admin.booking.status',
            targetType: 'BookingRequest',
            targetId: current.id,
            profileId: current.profileId,
            metadata: { from: current.status, to: change.status },
          },
          tx,
        );
      }
      return toBookingDetail(row);
    });
  }

  async remove(actor: AdminActor, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.bookingRequest.findUnique({ where: { id }, select: { id: true, profileId: true, status: true } });
      if (!current) throw Errors.notFound(NOT_FOUND);
      await tx.bookingRequest.delete({ where: { id: current.id } });
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.booking.delete',
          targetType: 'BookingRequest',
          targetId: current.id,
          profileId: current.profileId,
          metadata: { status: current.status },
        },
        tx,
      );
    });
  }
}
