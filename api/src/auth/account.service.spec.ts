import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors';
import type { RequestContext } from '../common/request-context';
import type { AppConfig } from '../config/app-config.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RegisterBody } from './account.dto';
import { AccountService, RESET_EMAILS_PER_USER_PER_DAY, RESET_EMAILS_PER_USER_PER_HOUR, forgotLookup } from './account.service';
import type { AuthService } from './auth.service';
import { LockoutService } from './lockout/lockout.service';
import type { PasswordHasher } from './password/password-hasher.service';
import type { EmailTokenService } from './tokens/email-token.service';
import type { SessionService } from './tokens/session.service';

type UserRow = { id: string; email: string | null; role: 'USER' | 'ADMIN'; status: 'ACTIVE' | 'SUSPENDED' };

const req = { ip: '10.0.0.1', headers: {} } as unknown as Request;

function resStub() {
  const cookies: { name: string; value: string }[] = [];
  const res = {
    cookie: jest.fn((name: string, value: string) => cookies.push({ name, value })),
    clearCookie: jest.fn(),
  } as unknown as Response;
  return { res, cookies };
}

function setup(opts: { users?: UserRow[]; registrationOpen?: boolean; issuedLastHour?: number; issuedLastDay?: number } = {}) {
  const users = opts.users ?? [];
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; username?: string } }) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        if (where.username) return users.find((u) => u.id === `id:${where.username}`) ?? null;
        return null;
      }),
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const config = {
    registrationOpen: opts.registrationOpen ?? true,
    cookieSecure: false,
    jwtAccessSecret: 'k'.repeat(64),
  } as unknown as AppConfig;
  const ctx = { ipHash: () => 'h'.repeat(64), userAgent: () => 'jest' } as unknown as RequestContext;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const mail = { send: jest.fn(() => true) } as unknown as MailService;
  const hasher = { hash: jest.fn(async () => '$argon2id$x'), dummyVerify: jest.fn(async () => false) } as unknown as PasswordHasher;
  const sessions = { create: jest.fn(), revokeAllForUser: jest.fn() } as unknown as SessionService;
  const lockout = new LockoutService({} as PrismaService, config);
  const countSince = jest.fn(async (_u: string, _t: string, since: Date) =>
    Date.now() - since.getTime() > 2 * 60 * 60 * 1000 ? (opts.issuedLastDay ?? 0) : (opts.issuedLastHour ?? 0),
  );
  const emailTokens = {
    issue: jest.fn(async () => 'token-en-claro'),
    countSince,
  } as unknown as EmailTokenService;
  const auth = { finishSession: jest.fn(), me: jest.fn() } as unknown as AuthService;
  const svc = new AccountService(
    prisma as unknown as PrismaService,
    config,
    ctx,
    audit,
    mail,
    hasher,
    sessions,
    lockout,
    emailTokens,
    auth,
  );
  return { svc, prisma, mail, emailTokens, audit, hasher, auth };
}

describe('forgotLookup', () => {
  it('correo si trae @, usuario si no; nada si no puede ser ninguno', () => {
    expect(forgotLookup('  DJ@Example.COM ')).toEqual({ email: 'dj@example.com' });
    expect(forgotLookup(' Mac.Fly ')).toEqual({ username: 'mac.fly' });
    expect(forgotLookup('no@valido')).toBeNull();
    expect(forgotLookup('con espacios')).toBeNull();
    expect(forgotLookup('')).toBeNull();
  });
});

describe('AccountService.forgotPassword', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const dj: UserRow = { id: 'id:dj.uno', email: 'dj@example.com', role: 'USER', status: 'ACTIVE' };
  const admin: UserRow = { id: 'id:fersua', email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE' };
  const suspended: UserRow = { id: 'id:dj.susp', email: 'susp@example.com', role: 'USER', status: 'SUSPENDED' };
  const noEmail: UserRow = { id: 'id:dj.sin', email: null, role: 'USER', status: 'ACTIVE' };

  it('responde sin consultar la BD: la búsqueda corre después de devolver', async () => {
    const { svc, prisma } = setup({ users: [dj] });
    expect(svc.forgotPassword({ identifier: 'dj.uno' }, req)).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await svc.settledForTesting();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('DJ activo: un token y un correo al user.email guardado, nunca al texto escrito', async () => {
    const { svc, mail, emailTokens, audit } = setup({ users: [dj] });
    svc.forgotPassword({ identifier: '  DJ@EXAMPLE.com ' }, req);
    await svc.settledForTesting();
    expect(emailTokens.issue).toHaveBeenCalledWith({ id: dj.id, email: 'dj@example.com' }, 'PASSWORD_RESET', { ipHash: 'h'.repeat(64) });
    expect(mail.send).toHaveBeenCalledWith('dj@example.com', 'reset-password', { token: 'token-en-claro' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.password_reset_requested', targetId: dj.id }));
  });

  it.each([
    ['usuario inexistente', 'nadie.aqui'],
    ['correo inexistente', 'nadie@example.com'],
    ['el admin (su rescate es por CLI)', 'fersua'],
    ['el admin por correo', 'admin@example.com'],
    ['cuenta suspendida', 'dj.susp'],
    ['cuenta sin correo', 'dj.sin'],
    ['identificador imposible', '<script>'],
  ])('%s: no emite token ni envía nada', async (_label, identifier) => {
    const { svc, mail, emailTokens, audit } = setup({ users: [dj, admin, suspended, noEmail] });
    svc.forgotPassword({ identifier }, req);
    await svc.settledForTesting();
    expect(emailTokens.issue).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it(`tope por usuario: ${RESET_EMAILS_PER_USER_PER_HOUR} por hora y ${RESET_EMAILS_PER_USER_PER_DAY} al día; pasado el tope no se envía nada`, async () => {
    for (const counts of [
      { issuedLastHour: RESET_EMAILS_PER_USER_PER_HOUR, issuedLastDay: RESET_EMAILS_PER_USER_PER_HOUR },
      { issuedLastHour: 0, issuedLastDay: RESET_EMAILS_PER_USER_PER_DAY },
    ]) {
      const { svc, mail, emailTokens } = setup({ users: [dj], ...counts });
      svc.forgotPassword({ identifier: 'dj.uno' }, req);
      await svc.settledForTesting();
      expect(emailTokens.issue).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    }
  });

  it('un error de la BD no se escapa (ni rechazo sin manejar ni respuesta distinta)', async () => {
    const { svc, prisma } = setup({ users: [dj] });
    prisma.user.findUnique.mockRejectedValueOnce(new Error('BD caída'));
    svc.forgotPassword({ identifier: 'dj.uno' }, req);
    await expect(svc.settledForTesting()).resolves.toBeUndefined();
  });
});

describe('AccountService.register', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const body = (over: Partial<RegisterBody> = {}): RegisterBody => ({
    username: 'Nuevo.DJ',
    email: 'Nuevo@Example.com',
    password: 'una-clave-larga-y-rara-93',
    acceptTerms: true,
    acceptPrivacy: true,
    confirmAge: true,
    ...over,
  });

  async function expectError(p: Promise<unknown>, status: number, code: string) {
    try {
      await p;
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).getStatus()).toBe(status);
      expect((err as AppError).code).toBe(code);
      return err as AppError;
    }
    throw new Error(`se esperaba ${status} ${code}`);
  }

  it('registro cerrado: 403 REGISTRATION_CLOSED sin tocar la BD', async () => {
    const { svc, prisma } = setup({ registrationOpen: false });
    await expectError(svc.register(body(), req, resStub().res), 403, 'REGISTRATION_CLOSED');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(svc.registration()).toEqual({ open: false });
  });

  it('casillas sin marcar, usuario reservado o correo inválido: 400 con el campo en details', async () => {
    const { svc } = setup();
    const err = await expectError(
      svc.register(body({ username: 'admin', email: 'x', acceptTerms: false as true, confirmAge: false as true }), req, resStub().res),
      400,
      'VALIDATION_FAILED',
    );
    expect(err.details).toEqual({ username: 'RESERVED', email: 'INVALID', acceptTerms: 'REQUIRED', confirmAge: 'REQUIRED' });
  });

  it('contraseña débil o con el usuario: 400 PASSWORD_WEAK con details.password', async () => {
    const { svc } = setup();
    const err = await expectError(svc.register(body({ password: 'corta' }), req, resStub().res), 400, 'PASSWORD_WEAK');
    expect(err.details).toEqual({ password: 'TOO_SHORT' });
    const err2 = await expectError(svc.register(body({ password: 'xx-nuevo.dj-2026' }), req, resStub().res), 400, 'PASSWORD_WEAK');
    expect(err2.details).toEqual({ password: 'CONTAINS_USERNAME' });
  });

  it('honeypot lleno: misma forma de respuesta y cookies, pero nada se guarda ni se envía', async () => {
    const { svc, prisma, mail, hasher } = setup();
    const { res, cookies } = resStub();
    const out = await svc.register(body({ hp_x7: 'http://spam.example' }), req, res);
    expect(out).toMatchObject({
      expiresIn: 900,
      user: { username: 'nuevo.dj', email: 'nuevo@example.com', role: 'USER', emailVerified: false, profile: null, termsOutdated: false },
    });
    expect(out.accessToken.split('.')).toHaveLength(3);
    expect(out.user.id).toMatch(/^c[a-f0-9]{24}$/);
    expect(cookies.map((c) => c.name).sort()).toEqual(['fs_session', 'kd', 'rt']);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(hasher.dummyVerify).toHaveBeenCalledTimes(1);
  });
});
