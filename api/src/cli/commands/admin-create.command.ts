import { LIMITS, isValidEmail, normalizeEmail, normalizeUsername, validateUsername } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { PasswordHasher } from '../../auth/password/password-hasher.service';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CliCommand } from '../command';
import { NEEDS_TTY, Prompter } from './admin-prompt';
import { obtainAdminPassword, printRecoveryCodes, setupTotp } from './admin-shared';

const DEFAULT_USERNAME = 'fersua';

/**
 * Crea el único admin: usuario, correo, contraseña oculta (dos veces, 12+) y TOTP obligatorio.
 * Uso normal en el VPS: docker compose run --rm -it api node dist/cli/main.js admin:create
 */
export const adminCreateCommand: CliCommand = {
  name: 'admin:create',
  summary: 'Crea el admin (contraseña por TTY + TOTP + códigos de recuperación)',
  usage: 'admin:create [--username u] [--email e] [--password-stdin] [--totp-secret-out archivo]',
  flags: { username: 'string', email: 'string', 'password-stdin': 'boolean', 'totp-secret-out': 'string' },
  async run(app, args) {
    const prisma = app.get(PrismaService);
    const config = app.get(AppConfig);
    const audit = app.get(AuditService);
    const fromStdin = args.flags['password-stdin'] === true;
    const secretOut = typeof args.flags['totp-secret-out'] === 'string' ? args.flags['totp-secret-out'] : null;
    const interactive = !fromStdin && Prompter.isInteractive();
    if (!fromStdin && !interactive) throw new Error(NEEDS_TTY);
    // La entrada estándar ya se consumió con la contraseña: el TOTP no se puede confirmar a mano.
    if (fromStdin && !secretOut) throw new Error('Con --password-stdin también hace falta --totp-secret-out.');

    const existing = await prisma.user.findFirst({ where: { OR: [{ role: 'ADMIN' }, { adminSlot: true }] }, select: { id: true } });
    if (existing) throw new Error('Ya existe un administrador. Usa admin:reset-password o admin:reset-mfa.');

    const prompter = new Prompter();
    try {
      // Usuario: "fersua" está en la lista de reservados justamente para que solo el admin lo tenga.
      let username = typeof args.flags.username === 'string' ? args.flags.username : '';
      if (!username && interactive) username = (await prompter.ask(`Usuario [${DEFAULT_USERNAME}]: `)) || DEFAULT_USERNAME;
      username = normalizeUsername(username || DEFAULT_USERNAME);
      if (validateUsername(username, { allowReserved: true })) {
        throw new Error(`Usuario inválido: ${LIMITS.user.usernameMin}-${LIMITS.user.usernameMax} caracteres, letras, números, "." o "_".`);
      }
      if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
        throw new Error('Ese usuario ya existe.');
      }

      // Correo: a donde llegan los avisos de ingreso desde una red nueva.
      let email = typeof args.flags.email === 'string' ? args.flags.email : '';
      if (!email && interactive) email = await prompter.ask('Correo (para avisos de seguridad): ');
      const normalizedEmail = email ? normalizeEmail(email) : null;
      if (interactive && !normalizedEmail) throw new Error('El correo es obligatorio.');
      if (normalizedEmail && !isValidEmail(normalizedEmail)) throw new Error('Correo inválido.');
      if (normalizedEmail && (await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } }))) {
        throw new Error('Ese correo ya está en uso por otra cuenta.');
      }

      const password = await obtainAdminPassword({ username, fromStdin, prompter });
      const passwordHash = await new PasswordHasher().hash(password);
      const totp = await setupTotp({ username, config, prompter: interactive ? prompter : null, secretOut });

      const now = new Date();
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username,
            email: normalizedEmail,
            emailVerifiedAt: normalizedEmail ? now : null,
            passwordHash,
            passwordChangedAt: now,
            role: 'ADMIN',
            adminSlot: true,
            mfaSecretEnc: totp.secretEnc,
            mfaEnabledAt: now,
            mfaRecoveryCodes: totp.recoveryHashes,
          },
          select: { id: true, username: true },
        });
        await audit.record(
          {
            actorUsername: 'cli',
            action: 'cli.admin.create',
            targetType: 'User',
            targetId: created.id,
            metadata: { hasEmail: normalizedEmail !== null },
          },
          tx,
        );
        return created;
      });

      printRecoveryCodes(totp.recoveryCodes);
      console.log(`Admin "${user.username}" creado con verificación en dos pasos.`);
    } finally {
      prompter.close();
    }
  },
};
