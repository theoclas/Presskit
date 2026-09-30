import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LIMITS } from '@fersua/shared';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MAIL_TEMPLATE_DAILY_CAPS, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { legalRetentionCutoff } from '../profiles/legal-retention.job';
import { ownerRecipientOf } from '../profiles/profile-notifier.service';

const DAY_MS = 86_400_000;
/** Filas por lote al borrar, y lotes por corrida (lo que sobre sigue mañana). */
const DELETE_BATCH = 500;
const MAX_BATCHES = 40;

export interface BookingRetentionSummary {
  expired: number;
  spam: number;
}

/** Día UTC anterior a `now` ([inicio, fin)): el mismo día con el que MailService cuenta sus topes. */
export function previousUtcDay(now: Date): { start: Date; end: Date } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start: new Date(end.getTime() - DAY_MS), end };
}

/**
 * Conservación de las solicitudes de booking (plan: "se guardan 12 meses"; política de datos §8;
 * docs/diseno/11 §5.4): cada día a las 04:30 de Bogotá borra las de más de 12 meses y las
 * marcadas como SPAM de más de 30 días. En lotes, y la auditoría guarda solo los conteos.
 */
@Injectable()
export class BookingRetentionJob {
  private readonly log = new Logger('BookingRetention');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron('0 30 4 * * *', { name: 'booking-retention', timeZone: 'America/Bogota' })
  async purge(at?: Date): Promise<BookingRetentionSummary> {
    // El programador de cron puede pasar su propio argumento: solo se acepta una fecha.
    const now = at instanceof Date ? at : new Date();
    const summary: BookingRetentionSummary = { expired: 0, spam: 0 };
    try {
      summary.expired = await this.deleteInBatches({ createdAt: { lt: legalRetentionCutoff(now, LIMITS.retention.bookingMonths) } });
      summary.spam = await this.deleteInBatches({
        status: 'SPAM',
        createdAt: { lt: new Date(now.getTime() - LIMITS.retention.spamDays * DAY_MS) },
      });
      if (summary.expired || summary.spam) {
        await this.audit.record({
          actorId: null,
          actorUsername: null,
          action: 'system.booking.retention_purged',
          targetType: 'BookingRequest',
          metadata: { ...summary },
        });
        this.log.log(`solicitudes purgadas: vencidas=${summary.expired} spam=${summary.spam}`);
      }
    } catch (err) {
      this.log.error(`purga de solicitudes falló: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
    return summary;
  }

  private async deleteInBatches(where: Prisma.BookingRequestWhereInput): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const ids = (await this.prisma.bookingRequest.findMany({ where, select: { id: true }, orderBy: { createdAt: 'asc' }, take: DELETE_BATCH })).map(
        (r) => r.id,
      );
      if (!ids.length) break;
      const { count } = await this.prisma.bookingRequest.deleteMany({ where: { id: { in: ids } } });
      total += count;
      if (ids.length < DELETE_BATCH) break;
    }
    return total;
  }
}

/**
 * Resumen de solicitudes (docs/api-m3.md: "Máximo 5 por día por destinatario; desde ahí, un
 * resumen"). Cada día a las 08:00 de Bogotá: a los DJ que ayer (día UTC, el de los topes de
 * MailService) recibieron más solicitudes que avisos permitidos y todavía tienen solicitudes sin
 * leer, un solo correo con el número. Sin datos de los solicitantes.
 */
@Injectable()
export class BookingDigestJob {
  private readonly log = new Logger('BookingDigest');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron('0 0 8 * * *', { name: 'booking-digest', timeZone: 'America/Bogota' })
  async run(at?: Date): Promise<number> {
    const now = at instanceof Date ? at : new Date();
    const cap = MAIL_TEMPLATE_DAILY_CAPS['booking-new-owner'] ?? 0;
    let sent = 0;
    try {
      const { start, end } = previousUtcDay(now);
      // Las marcadas como SPAM al llegar nunca se avisan: no cuentan para el tope.
      const groups = await this.prisma.bookingRequest.groupBy({
        by: ['profileId'],
        where: { createdAt: { gte: start, lt: end }, status: { not: 'SPAM' } },
        _count: { _all: true },
      });
      for (const g of groups) {
        if (g._count._all <= cap) continue;
        const profile = await this.prisma.djProfile.findUnique({
          where: { id: g.profileId },
          select: { notifyByEmail: true, user: { select: { email: true, emailVerifiedAt: true, role: true, status: true } } },
        });
        const to = ownerRecipientOf(profile?.user);
        if (!profile?.notifyByEmail || !to) continue;
        const count = await this.prisma.bookingRequest.count({ where: { profileId: g.profileId, status: 'NEW' } });
        if (count && this.mail.send(to.email, 'booking-digest-owner', { count })) sent++;
      }
      if (sent) this.log.log(`resúmenes de solicitudes enviados: ${sent}`);
    } catch (err) {
      this.log.error(`resumen de solicitudes falló: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
    return sent;
  }
}
