import { Injectable } from '@nestjs/common';
import { LIMITS, type BookingDetailDto, type BookingListItemDto, type Paginated, type UnreadCountDto } from '@fersua/shared';
import type { Prisma } from '@prisma/client';
import {
  bookingDetailSelect,
  bookingListSelect,
  statusChange,
  toBookingDetail,
  toBookingListItem,
} from '../admin/bookings/booking-view';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { OwnerBookingsQuery, UpdateOwnerBookingBody } from './dto/owner.dto';
import type { EditorActor } from './editor-actor';
import { ProfileStore } from './profile-store.service';

const NOT_FOUND = 'Solicitud no encontrada.';

/**
 * Bandeja de solicitudes del dueño (docs/api-m3.md): la misma forma que la del admin
 * (booking-view), limitada a su perfil. Toda consulta va con { id, profileId }: el id de una
 * solicitud de otro perfil da el mismo 404 que uno inexistente.
 * Las lecturas no se auditan (el DJ es el responsable de su bandeja); los cambios de estado y
 * los borrados sí, como profile.booking.* (sin datos del solicitante).
 */
@Injectable()
export class OwnerBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
  ) {}

  async list(profileId: ScopedProfileId, q: OwnerBookingsQuery): Promise<Paginated<BookingListItemDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? LIMITS.booking.inboxPageSize;
    const where: Prisma.BookingRequestWhereInput = { profileId, status: q.status ?? { not: 'SPAM' } };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        select: bookingListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(toBookingListItem), page, pageSize, total };
  }

  async unreadCount(profileId: ScopedProfileId): Promise<UnreadCountDto> {
    const count = await this.prisma.bookingRequest.count({ where: { profileId, status: 'NEW' } });
    return { count };
  }

  /** Abrir una solicitud nueva la marca leída (solo si seguía NEW: no toca archivadas ni spam). */
  async detail(profileId: ScopedProfileId, id: string): Promise<BookingDetailDto> {
    const row = await this.prisma.bookingRequest.findFirst({ where: { id, profileId }, select: bookingDetailSelect });
    if (!row) throw Errors.notFound(NOT_FOUND);
    if (row.status !== 'NEW') return toBookingDetail(row);
    const now = new Date();
    await this.prisma.bookingRequest.updateMany({ where: { id, profileId, status: 'NEW' }, data: { status: 'READ', readAt: now } });
    const fresh = await this.prisma.bookingRequest.findFirst({ where: { id, profileId }, select: bookingDetailSelect });
    if (!fresh) throw Errors.notFound(NOT_FOUND);
    return toBookingDetail(fresh);
  }

  async updateStatus(profileId: ScopedProfileId, actor: EditorActor, id: string, body: UpdateOwnerBookingBody): Promise<BookingDetailDto> {
    return this.store.transaction(async (tx) => {
      const current = await tx.bookingRequest.findFirst({
        where: { id, profileId },
        select: { id: true, status: true, readAt: true, archivedAt: true },
      });
      if (!current) throw Errors.notFound(NOT_FOUND);
      const change = statusChange(body.status, current, new Date());
      await tx.bookingRequest.updateMany({
        where: { id: current.id, profileId },
        data: { status: change.status, readAt: change.readAt, archivedAt: change.archivedAt },
      });
      if (current.status !== change.status) {
        await this.store.record(tx, profileId, actor, 'booking.status', {
          targetType: 'BookingRequest',
          targetId: current.id,
          meta: { from: current.status, to: change.status },
        });
      }
      const row = await tx.bookingRequest.findFirst({ where: { id: current.id, profileId }, select: bookingDetailSelect });
      if (!row) throw Errors.notFound(NOT_FOUND);
      return toBookingDetail(row);
    });
  }

  async remove(profileId: ScopedProfileId, actor: EditorActor, id: string): Promise<void> {
    await this.store.transaction(async (tx) => {
      const current = await tx.bookingRequest.findFirst({ where: { id, profileId }, select: { id: true, status: true } });
      if (!current) throw Errors.notFound(NOT_FOUND);
      await tx.bookingRequest.deleteMany({ where: { id: current.id, profileId } });
      await this.store.record(tx, profileId, actor, 'booking.delete', {
        targetType: 'BookingRequest',
        targetId: current.id,
        meta: { status: current.status },
      });
    });
  }
}
