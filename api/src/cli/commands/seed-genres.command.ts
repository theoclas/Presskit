import { GENRE_SEED } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CliCommand } from '../command';

/**
 * Crea los géneros del catálogo inicial que falten. Idempotente y no pisa nada: si el admin
 * renombró o desactivó un género, se respeta.
 */
export const seedGenresCommand: CliCommand = {
  name: 'seed:genres',
  summary: 'Crea los géneros del catálogo inicial que falten',
  usage: 'seed:genres',
  flags: {},
  async run(app) {
    const prisma = app.get(PrismaService);
    const audit = app.get(AuditService);

    let created = 0;
    for (const [i, g] of GENRE_SEED.entries()) {
      const exists = await prisma.genre.findUnique({ where: { slug: g.slug }, select: { id: true } });
      if (exists) continue;
      // Saltos de 10 en el orden: el admin puede intercalar géneros sin reordenar todo.
      await prisma.genre.create({ data: { slug: g.slug, name: g.name, sortOrder: (i + 1) * 10 } });
      created++;
    }

    if (created) {
      await audit.record({
        actorUsername: 'cli',
        action: 'seed.genres',
        targetType: 'Genre',
        metadata: { created, total: GENRE_SEED.length },
      });
    }
    console.log(`Géneros: ${created} creados, ${GENRE_SEED.length - created} ya existían.`);
  },
};
