import { AuditService } from '../../audit/audit.service';
import { PasswordHasher } from '../../auth/password/password-hasher.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CliCommand } from '../command';
import { NEEDS_TTY, Prompter } from './admin-prompt';
import { findAdmin, obtainAdminPassword } from './admin-shared';

/**
 * Rescate del admin desde el VPS (su recuperación nunca es por correo): contraseña nueva por
 * TTY, desbloqueo y cierre de todas sus sesiones.
 */
export const adminResetPasswordCommand: CliCommand = {
  name: 'admin:reset-password',
  summary: 'Nueva contraseña del admin por TTY; cierra todas sus sesiones',
  usage: 'admin:reset-password [--password-stdin]',
  flags: { 'password-stdin': 'boolean' },
  async run(app, args) {
    const prisma = app.get(PrismaService);
    const audit = app.get(AuditService);
    const fromStdin = args.flags['password-stdin'] === true;
    if (!fromStdin && !Prompter.isInteractive()) throw new Error(NEEDS_TTY);

    const admin = await findAdmin(prisma);
    const prompter = new Prompter();
    try {
      console.log(`Nueva contraseña para "${admin.username}".`);
      const password = await obtainAdminPassword({ username: admin.username, fromStdin, prompter });
      const passwordHash = await new PasswordHasher().hash(password);
      const now = new Date();
      const revoked = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: admin.id },
          data: {
            passwordHash,
            passwordChangedAt: now,
            mustChangePassword: false,
            tempPasswordExpiresAt: null,
            // tokenVersion++: los access tokens emitidos dejan de servir ya mismo.
            tokenVersion: { increment: 1 },
            failedLoginCount: 0,
            lockedUntil: null,
            mfaFailedCount: 0,
            mfaLockedUntil: null,
          },
        });
        const res = await tx.refreshToken.updateMany({
          where: { userId: admin.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'ADMIN_ACTION' },
        });
        await audit.record(
          {
            actorUsername: 'cli',
            action: 'cli.admin.reset_password',
            targetType: 'User',
            targetId: admin.id,
            metadata: { sessionsRevoked: res.count },
          },
          tx,
        );
        return res.count;
      });
      console.log(`Contraseña cambiada. Sesiones cerradas: ${revoked}.`);
    } finally {
      prompter.close();
    }
  },
};
