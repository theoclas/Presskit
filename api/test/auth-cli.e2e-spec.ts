// e2e de la CLI del admin: crea el admin con --password-stdin y --totp-secret-out, entra por
// el api con contraseña + TOTP, y prueba reset-password, unlock y reset-mfa. Los comandos
// corren en el mismo proceso (con la entrada estándar simulada). Si la BD ya tiene un admin
// (el real, en desarrollo), la suite se salta: admin:create se niega a crear un segundo.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

jest.mock('../src/cli/commands/admin-prompt', () => ({
  ...jest.requireActual('../src/cli/commands/admin-prompt'),
  readPasswordFromStdin: jest.fn(),
}));

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { XHR_HEADER_VALUE } from '../src/auth/auth.constants';
import { currentTotp } from '../src/auth/mfa/totp';
import { parseArgs } from '../src/cli/args';
import { readPasswordFromStdin } from '../src/cli/commands/admin-prompt';
import { adminCreateCommand } from '../src/cli/commands/admin-create.command';
import { adminResetMfaCommand } from '../src/cli/commands/admin-reset-mfa.command';
import { adminResetPasswordCommand } from '../src/cli/commands/admin-reset-password.command';
import { adminUnlockCommand } from '../src/cli/commands/admin-unlock.command';
import type { CliCommand } from '../src/cli/command';
import { createTestApp, nextIp, strongPassword, uniqueEmail, type TestApp } from './auth.e2e-helpers';

const stdinPassword = readPasswordFromStdin as jest.MockedFunction<typeof readPasswordFromStdin>;

describe('CLI del admin (e2e)', () => {
  let t: TestApp;
  let dir: string;
  let adminId: string | null = null;
  let skip = false;
  const username = `tcli${randomBytes(3).toString('hex')}`;

  beforeAll(async () => {
    t = await createTestApp();
    dir = mkdtempSync(path.join(tmpdir(), 'fersua-cli-'));
    skip = (await t.prisma.user.count({ where: { OR: [{ role: 'ADMIN' }, { adminSlot: true }] } })) > 0;
    if (skip) console.warn('Ya hay un admin en esta BD: se salta la prueba de admin:create.');
  });

  beforeEach(() => {
    // Sin valores sobrantes de una prueba anterior (p. ej. un create que falló antes de leer).
    stdinPassword.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    (console.log as jest.Mock).mockRestore?.();
  });

  afterAll(async () => {
    if (adminId) {
      await t.prisma.auditLog.deleteMany({ where: { OR: [{ actorId: adminId }, { targetId: adminId }] } });
      await t.prisma.user.deleteMany({ where: { id: adminId } });
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
    await t?.app.close();
  });

  const run = (cmd: CliCommand, argv: string[]) => cmd.run(t.app, parseArgs(argv, cmd.flags));

  const fullLogin = async (password: string, secret: string) => {
    const ip = nextIp();
    const step1 = await t.http.post('/api/auth/login').set('X-Forwarded-For', ip).send({ username, password });
    if (step1.status !== 200) return step1;
    return t.http
      .post('/api/auth/mfa')
      .set('X-Forwarded-For', ip)
      .set('X-Requested-With', XHR_HEADER_VALUE)
      .send({ mfaToken: step1.body.mfaToken, code: currentTotp(secret) });
  };

  it('admin:create → login con contraseña + TOTP; un segundo admin se rechaza', async () => {
    if (skip) return;
    const password = strongPassword();
    stdinPassword.mockResolvedValueOnce(password);
    const secretFile = path.join(dir, 'totp.txt');
    await run(adminCreateCommand, ['--password-stdin', '--totp-secret-out', secretFile, '--username', username, '--email', uniqueEmail('cli')]);

    const row = await t.prisma.user.findUniqueOrThrow({
      where: { username },
      select: { id: true, role: true, adminSlot: true, mfaEnabledAt: true, mfaRecoveryCodes: true, emailVerifiedAt: true, passwordHash: true },
    });
    adminId = row.id;
    expect(row).toMatchObject({ role: 'ADMIN', adminSlot: true });
    expect(row.mfaEnabledAt).not.toBeNull();
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.mfaRecoveryCodes).toHaveLength(10);
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await t.prisma.auditLog.count({ where: { action: 'cli.admin.create', targetId: row.id } })).toBe(1);

    const secret = readFileSync(secretFile, 'utf8').trim();
    const ok = await fullLogin(password, secret);
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ username, role: 'ADMIN', mfaEnabled: true });

    stdinPassword.mockResolvedValueOnce(strongPassword());
    await expect(
      run(adminCreateCommand, ['--password-stdin', '--totp-secret-out', path.join(dir, 'otro.txt'), '--username', `${username}b`]),
    ).rejects.toThrow(/Ya existe un administrador/);
  });

  it('admin:reset-password cambia la clave y cierra las sesiones; admin:unlock limpia el contador', async () => {
    if (skip || !adminId) return;
    const secret = readFileSync(path.join(dir, 'totp.txt'), 'utf8').trim();
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { tokenVersion: true } });

    const weak = 'corta';
    stdinPassword.mockResolvedValueOnce(weak);
    await expect(run(adminResetPasswordCommand, ['--password-stdin'])).rejects.toThrow(/12 caracteres/);

    const next = strongPassword();
    stdinPassword.mockResolvedValueOnce(next);
    await run(adminResetPasswordCommand, ['--password-stdin']);
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { tokenVersion: true } });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(await t.prisma.refreshToken.count({ where: { userId: adminId, revokedAt: null } })).toBe(0);

    // El TOTP del login anterior ya se usó en este paso de 30 s: se prueba solo la contraseña.
    const step1 = await t.http.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ username, password: next });
    expect(step1.status).toBe(200);
    expect(step1.body.mfaRequired).toBe(true);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    await t.prisma.user.update({ where: { id: adminId }, data: { failedLoginCount: 7 } });
    await run(adminUnlockCommand, []);
    const unlocked = await t.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { failedLoginCount: true, lockedUntil: true } });
    expect(unlocked).toEqual({ failedLoginCount: 0, lockedUntil: null });
    await expect(run(adminUnlockCommand, ['--username', 'nadie-existe-aqui'])).rejects.toThrow(/No existe/);
  });

  it('admin:reset-mfa cambia el secreto y los códigos de recuperación', async () => {
    if (skip || !adminId) return;
    const old = await t.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { mfaSecretEnc: true, mfaRecoveryCodes: true, tokenVersion: true } });
    const newFile = path.join(dir, 'totp-nuevo.txt');
    await run(adminResetMfaCommand, ['--totp-secret-out', newFile]);
    const now = await t.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { mfaSecretEnc: true, mfaRecoveryCodes: true, tokenVersion: true } });
    expect(now.mfaSecretEnc).not.toBe(old.mfaSecretEnc);
    expect(now.mfaRecoveryCodes).not.toEqual(old.mfaRecoveryCodes);
    expect(now.tokenVersion).toBe(old.tokenVersion + 1);
    expect(readFileSync(newFile, 'utf8').trim()).not.toBe(readFileSync(path.join(dir, 'totp.txt'), 'utf8').trim());
    const actions = await t.prisma.auditLog.findMany({ where: { targetId: adminId, action: { startsWith: 'cli.' } }, select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual(['cli.admin.create', 'cli.admin.reset_mfa', 'cli.admin.reset_password', 'cli.admin.unlock']);
  });
});
