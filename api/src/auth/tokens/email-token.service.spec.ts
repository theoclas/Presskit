import type { EmailTokenType } from '@prisma/client';
import { sha256Hex } from '../../common/crypto';
import type { AppConfig } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_TOKEN_TTL_MS, EmailTokenService, isWellFormedEmailToken } from './email-token.service';

interface Row {
  id: string;
  userId: string;
  type: EmailTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  requestIpHash: string | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerifiedAt: Date | null;
}

type Where = { id?: string; userId?: string; type?: EmailTokenType; usedAt?: null; expiresAt?: { gt?: Date; lt?: Date }; createdAt?: { gt: Date } };

function matches(r: Row, w: Where): boolean {
  if (w.id !== undefined && r.id !== w.id) return false;
  if (w.userId !== undefined && r.userId !== w.userId) return false;
  if (w.type !== undefined && r.type !== w.type) return false;
  if (w.usedAt === null && r.usedAt !== null) return false;
  if (w.expiresAt?.gt && !(r.expiresAt > w.expiresAt.gt)) return false;
  if (w.expiresAt?.lt && !(r.expiresAt < w.expiresAt.lt)) return false;
  if (w.createdAt?.gt && !(r.createdAt > w.createdAt.gt)) return false;
  return true;
}

/** Lo justo de Prisma para EmailToken, en memoria. */
function fakePrisma(users: UserRow[], clock: () => Date) {
  const rows: Row[] = [];
  let seq = 0;
  const emailToken = {
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'usedAt' | 'createdAt'> }) => {
      const row: Row = { ...data, id: `tok${++seq}`, usedAt: null, createdAt: clock() };
      rows.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const r = rows.find((x) => x.tokenHash === where.tokenHash);
      if (!r) return null;
      const u = users.find((x) => x.id === r.userId)!;
      return { id: r.id, type: r.type, expiresAt: r.expiresAt, usedAt: r.usedAt, user: { ...u } };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: { usedAt: Date } }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) r.usedAt = data.usedAt;
      return { count: hit.length };
    }),
    count: jest.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length),
    deleteMany: jest.fn(async ({ where }: { where: Where }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      return { count: hit.length };
    }),
  };
  return { prisma: { emailToken } as unknown as PrismaService, rows, emailToken };
}

describe('EmailTokenService', () => {
  const config = { jwtAccessSecret: 'k'.repeat(64) } as AppConfig;
  let now: Date;
  const clock = () => now;
  let users: UserRow[];

  beforeEach(() => {
    now = new Date('2026-09-29T15:00:00Z');
    users = [{ id: 'u1', username: 'dj.uno', email: 'dj@example.com', role: 'USER', status: 'ACTIVE', emailVerifiedAt: null }];
  });

  function setup() {
    const fake = fakePrisma(users, clock);
    return { ...fake, svc: new EmailTokenService(fake.prisma, config) };
  }

  it('emite un token de 65 caracteres base64url, guarda solo su SHA-256 y respeta la vigencia de cada tipo', async () => {
    const { svc, rows } = setup();
    const token = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'EMAIL_VERIFY', { ipHash: 'h'.repeat(64), now });
    expect(isWellFormedEmailToken(token)).toBe(true);
    expect(token).toHaveLength(65);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0]!.expiresAt.getTime() - now.getTime()).toBe(48 * 60 * 60 * 1000);
    expect(rows[0]!.requestIpHash).toBe('h'.repeat(64));
    await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    expect(rows[1]!.expiresAt.getTime() - now.getTime()).toBe(30 * 60 * 1000);
    expect(EMAIL_TOKEN_TTL_MS.PASSWORD_RESET).toBe(30 * 60 * 1000);
  });

  it('un solo uso: find no consume, consume gana una vez y después el token ya no sirve', async () => {
    const { svc } = setup();
    const token = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    const found = await svc.find(token, 'PASSWORD_RESET', now);
    expect(found).toMatchObject({ user: { id: 'u1', username: 'dj.uno', email: 'dj@example.com' } });
    expect(await svc.find(token, 'PASSWORD_RESET', now)).not.toBeNull();
    expect(await svc.consume(found!.id, undefined, now)).toBe(true);
    expect(await svc.consume(found!.id, undefined, now)).toBe(false);
    expect(await svc.find(token, 'PASSWORD_RESET', now)).toBeNull();
  });

  it('emitir uno nuevo anula los anteriores del mismo tipo, no los del otro', async () => {
    const { svc } = setup();
    const verify = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'EMAIL_VERIFY', { now });
    const first = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    const second = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    expect(await svc.find(first, 'PASSWORD_RESET', now)).toBeNull();
    expect(await svc.find(second, 'PASSWORD_RESET', now)).not.toBeNull();
    expect(await svc.find(verify, 'EMAIL_VERIFY', now)).not.toBeNull();
    // Los anulados siguen contando para los topes por usuario.
    expect(await svc.countSince('u1', 'PASSWORD_RESET', new Date(now.getTime() - 60_000))).toBe(2);
  });

  it('vencido, de otro tipo, mal formado o alterado: null', async () => {
    const { svc } = setup();
    const token = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    expect(await svc.find(token, 'EMAIL_VERIFY', now)).toBeNull();
    expect(await svc.find(token, 'PASSWORD_RESET', new Date(now.getTime() + 30 * 60 * 1000))).toBeNull();
    expect(await svc.find(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 'PASSWORD_RESET', now)).toBeNull();
    expect(await svc.find('corto', 'PASSWORD_RESET', now)).toBeNull();
    expect(await svc.find(null, 'PASSWORD_RESET', now)).toBeNull();
    expect(await svc.find(`${token}x`, 'PASSWORD_RESET', now)).toBeNull();
  });

  it('atado al correo: si el correo cambia o se quita, el enlace que llegó al buzón anterior deja de servir', async () => {
    const { svc } = setup();
    const token = await svc.issue({ id: 'u1', email: 'DJ@Example.com' }, 'EMAIL_VERIFY', { now });
    expect(await svc.find(token, 'EMAIL_VERIFY', now)).not.toBeNull();
    users[0]!.email = 'nuevo@example.com';
    expect(await svc.find(token, 'EMAIL_VERIFY', now)).toBeNull();
    users[0]!.email = null;
    expect(await svc.find(token, 'EMAIL_VERIFY', now)).toBeNull();
    users[0]!.email = 'dj@example.com';
    expect(await svc.find(token, 'EMAIL_VERIFY', now)).not.toBeNull();
  });

  it('consume no gana con un token vencido aunque nadie lo haya usado', async () => {
    const { svc } = setup();
    const token = await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    const found = await svc.find(token, 'PASSWORD_RESET', now);
    expect(await svc.consume(found!.id, undefined, new Date(now.getTime() + 31 * 60 * 1000))).toBe(false);
  });

  it('invalidate anula todos los pendientes del usuario; purgeExpired borra los vencidos hace más de un día', async () => {
    const { svc, rows } = setup();
    await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'EMAIL_VERIFY', { now });
    await svc.issue({ id: 'u1', email: 'dj@example.com' }, 'PASSWORD_RESET', { now });
    expect(await svc.invalidate('u1', null, undefined, now)).toBe(2);
    expect(rows.every((r) => r.usedAt)).toBe(true);
    expect(await svc.purgeExpired(new Date(now.getTime() + 24 * 60 * 60 * 1000))).toBe(0);
    expect(await svc.purgeExpired(new Date(now.getTime() + 25 * 60 * 60 * 1000))).toBe(1);
    expect(await svc.purgeExpired(new Date(now.getTime() + 73 * 60 * 60 * 1000))).toBe(1);
    expect(rows).toHaveLength(0);
  });
});
