import { Injectable } from '@nestjs/common';
import { PROFILE_STATUSES, todayBogota, type AdminStatsDto, type ProfileStatus } from '@fersua/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnlyToDb } from '../../public/date-only';
import { OPEN_TICKET_STATUSES } from '../tickets/ticket-view';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tablero del admin. Las solicitudes SPAM no cuentan en los últimos 30 días; las que el DJ
   * borró de su bandeja no cuentan como nuevas. Los tickets marcados como spam no cuentan en
   * abiertos ni vencidos (la insignia): van aparte, los de los últimos 30 días.
   */
  async stats(now: Date = new Date()): Promise<AdminStatsDto> {
    const today = dateOnlyToDb(todayBogota(now));
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [byStatus, bookingsLast30Days, newBookings, openTickets, overdueTickets, spamTickets, users, withoutLegal] = await Promise.all([
      this.prisma.djProfile.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.bookingRequest.count({ where: { createdAt: { gte: since }, status: { not: 'SPAM' } } }),
      this.prisma.bookingRequest.count({ where: { status: 'NEW', ownerDeletedAt: null } }),
      this.prisma.ticket.count({ where: { isSpam: false, status: { in: OPEN_TICKET_STATUSES } } }),
      this.prisma.ticket.count({ where: { isSpam: false, status: { in: OPEN_TICKET_STATUSES }, dueAt: { lt: today } } }),
      this.prisma.ticket.count({ where: { isSpam: true, createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { role: 'USER' } }),
      // Públicos sin el registro del art. 53 (p. ej. la semilla): el resumen los señala.
      this.prisma.djProfile.findMany({
        where: { status: 'APPROVED', legalInfo: { is: null } },
        select: { id: true, slug: true, displayName: true },
        orderBy: { displayName: 'asc' },
        take: 10,
      }),
    ]);

    const profiles = Object.fromEntries(PROFILE_STATUSES.map((s) => [s, 0])) as Record<ProfileStatus, number>;
    for (const row of byStatus) profiles[row.status] = row._count._all;

    return {
      profiles,
      pendingReview: profiles.PENDING_REVIEW,
      bookingsLast30Days,
      newBookings,
      openTickets,
      overdueTickets,
      spamTickets,
      users,
      approvedWithoutLegal: withoutLegal,
    };
  }
}
