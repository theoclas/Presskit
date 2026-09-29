import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_TIME_ZONE, LIMITS } from '@fersua/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';

const BATCH = 100;
const TMP_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Limpieza horaria: assets subidos que nunca se enlazaron (el usuario cerró el editor) y
 * restos de escrituras interrumpidas en .tmp. Solo corre en el servidor HTTP: la CLI no
 * importa ScheduleModule, así que ahí el decorador no hace nada.
 */
@Injectable()
export class MediaCleanupJob {
  private readonly logger = new Logger(MediaCleanupJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'media-cleanup', timeZone: APP_TIME_ZONE })
  async handle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const orphans = await this.removeOrphans();
      const tmp = await this.storage.sweepTmp(TMP_MAX_AGE_MS);
      if (orphans || tmp) this.logger.log(`Limpieza de media: ${orphans} huérfanos, ${tmp} temporales`);
    } catch (err) {
      this.logger.error(`Falló la limpieza de media: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  async removeOrphans(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - LIMITS.upload.orphanTtlHours * 60 * 60 * 1000);
    // Doble condición: sin attachedAt Y sin ninguna referencia. Aunque algún flujo olvide
    // marcar attachedAt, nunca se borra una imagen que una página esté usando.
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        attachedAt: null,
        createdAt: { lt: cutoff },
        heroOf: { is: null },
        cardOf: { is: null },
        memberOf: { is: null },
        galleryOf: { is: null },
        flyerOf: { is: null },
      },
      select: { id: true, storageKey: true, isPublic: true },
      take: BATCH,
    });
    let removed = 0;
    for (const row of rows) {
      try {
        await this.media.remove(row);
        removed++;
      } catch (err) {
        this.logger.warn(`No se pudo borrar el asset huérfano ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return removed;
  }
}
