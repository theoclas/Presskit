import { normalizeUsername } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CliCommand } from '../command';
import { findAdmin } from './admin-shared';

/**
 * Quita el bloqueo por intentos fallidos, de contraseña y de 2FA (del admin, o de otro usuario
 * con --username).
 * Deja failedLoginCount en 0: el api ve eso en el siguiente intento y limpia también los
 * bloqueos por IP que tiene en memoria (la CLI corre en otro proceso).
 */
export const adminUnlockCommand: CliCommand = {
  name: 'admin:unlock',
  summary: 'Desbloquea la cuenta (el admin, o --username <usuario>)',
  usage: 'admin:unlock [--username u]',
  flags: { username: 'string' },
  async run(app, args) {
    const prisma = app.get(PrismaService);
    const audit = app.get(AuditService);

    const target =
      typeof args.flags.username === 'string'
        ? await prisma.user.findUnique({
            where: { username: normalizeUsername(args.flags.username) },
            select: { id: true, username: true, role: true },
          })
        : await findAdmin(prisma);
    if (!target) throw new Error('No existe ese usuario.');

    await prisma.$transaction(async (tx) => {
      // También la pausa del 2FA: es el rescate si el admin quedó afuera desde un navegador nuevo.
      await tx.user.update({
        where: { id: target.id },
        data: { failedLoginCount: 0, lockedUntil: null, mfaFailedCount: 0, mfaLockedUntil: null },
      });
      await audit.record(
        { actorUsername: 'cli', action: 'cli.admin.unlock', targetType: 'User', targetId: target.id, metadata: { role: target.role } },
        tx,
      );
    });
    console.log(`Cuenta "${target.username}" desbloqueada.`);
  },
};
