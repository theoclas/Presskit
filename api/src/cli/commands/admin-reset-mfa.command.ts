import { AuditService } from '../../audit/audit.service';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CliCommand } from '../command';
import { NEEDS_TTY, Prompter } from './admin-prompt';
import { findAdmin, printRecoveryCodes, setupTotp } from './admin-shared';

/**
 * Teléfono perdido o códigos agotados: TOTP nuevo con su QR, códigos de recuperación nuevos
 * (los viejos dejan de servir) y cierre de todas las sesiones del admin.
 */
export const adminResetMfaCommand: CliCommand = {
  name: 'admin:reset-mfa',
  summary: 'TOTP y códigos de recuperación nuevos para el admin; cierra sus sesiones',
  usage: 'admin:reset-mfa [--totp-secret-out archivo]',
  flags: { 'totp-secret-out': 'string' },
  async run(app, args) {
    const prisma = app.get(PrismaService);
    const config = app.get(AppConfig);
    const audit = app.get(AuditService);
    const secretOut = typeof args.flags['totp-secret-out'] === 'string' ? args.flags['totp-secret-out'] : null;
    const interactive = Prompter.isInteractive();
    if (!interactive && !secretOut) throw new Error(NEEDS_TTY);

    const admin = await findAdmin(prisma);
    const prompter = new Prompter();
    try {
      console.log(`Nueva verificación en dos pasos para "${admin.username}".`);
      const totp = await setupTotp({ username: admin.username, config, prompter: interactive ? prompter : null, secretOut });
      const now = new Date();
      const revoked = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: admin.id },
          data: {
            mfaSecretEnc: totp.secretEnc,
            mfaEnabledAt: now,
            mfaRecoveryCodes: totp.recoveryHashes,
            // Secreto nuevo: los códigos malos del anterior ya no cuentan.
            mfaFailedCount: 0,
            mfaLockedUntil: null,
            tokenVersion: { increment: 1 },
          },
        });
        const res = await tx.refreshToken.updateMany({
          where: { userId: admin.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'ADMIN_ACTION' },
        });
        await audit.record(
          { actorUsername: 'cli', action: 'cli.admin.reset_mfa', targetType: 'User', targetId: admin.id, metadata: { sessionsRevoked: res.count } },
          tx,
        );
        return res.count;
      });
      printRecoveryCodes(totp.recoveryCodes);
      console.log(`TOTP reemplazado. Sesiones cerradas: ${revoked}.`);
    } finally {
      prompter.close();
    }
  },
};
