import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LIMITS } from '@fersua/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Fecha límite: los registros cerrados antes de esto ya cumplieron su conservación. */
export function legalRetentionCutoff(now: Date, months: number = LIMITS.retention.legalInfoMonths): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

/**
 * Registro del art. 53 de perfiles borrados: se conserva 12 meses desde el borrado (para
 * entregarlo a quien se queje del DJ o a una autoridad) y después se elimina de verdad.
 */
@Injectable()
export class LegalRetentionJob {
  private readonly log = new Logger('LegalRetention');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron('0 20 4 * * *', { timeZone: 'America/Bogota' })
  async purge(now: Date = new Date()): Promise<number> {
    try {
      const { count } = await this.prisma.djLegalInfo.deleteMany({
        where: { profileId: null, closedAt: { lt: legalRetentionCutoff(now) } },
      });
      if (count) {
        await this.audit.record({
          actorId: null,
          actorUsername: null,
          action: 'system.legal_info_purged',
          targetType: 'DjLegalInfo',
          metadata: { count },
        });
        this.log.log(`registros legales purgados: ${count}`);
      }
      return count;
    } catch (err) {
      this.log.error(`purga de registros legales falló: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }
}
