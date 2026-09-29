import { JwtService } from '@nestjs/jwt';
import type { AuditService } from '../../audit/audit.service';
import { sha256Hex } from '../../common/crypto';
import type { AppConfig } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { REFRESH_GRACE_MS } from '../auth.constants';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const DAY = 24 * 60 * 60 * 1000;
const RAW = 'A'.repeat(43);
const USER = { id: 'cuser000000000000000000001', username: 'dj.prueba', role: 'USER' as const, status: 'ACTIVE' as const, tokenVersion: 3 };

type Row = {
  id: string;
  familyId: string;
  expiresAt: Date;
  familyExpiresAt: Date;
  replacedAt: Date | null;
  replacedById: string | null;
  revokedAt: Date | null;
  user: typeof USER | (Omit<typeof USER, 'role' | 'status'> & { role: 'USER' | 'ADMIN'; status: 'ACTIVE' | 'SUSPENDED' });
};

function row(over: Partial<Row> = {}): Row {
  const now = Date.now();
  return {
    id: 'crt00000000000000000000001',
    familyId: 'f'.repeat(30),
    expiresAt: new Date(now + DAY),
    familyExpiresAt: new Date(now + 20 * DAY),
    replacedAt: null,
    replacedById: null,
    revokedAt: null,
    user: USER,
    ...over,
  };
}

function setup(found: Row | null, opts: { casCount?: number; successor?: { replacedAt: Date | null } | null } = {}) {
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(async (args: { where: { tokenHash?: string; id?: string } }) => {
        if (args.where.tokenHash) return args.where.tokenHash === sha256Hex(RAW) ? found : null;
        return opts.successor ?? null;
      }),
      create: jest.fn(async () => ({ id: 'crt00000000000000000000002' })),
      updateMany: jest.fn(async (args: { where: { id?: string } }) => ({ count: args.where.id ? (opts.casCount ?? 1) : 2 })),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  const audit = { record: jest.fn(async () => undefined) };
  const tokens = new TokenService(new JwtService(), { jwtAccessSecret: 'k'.repeat(64) } as AppConfig);
  const svc = new SessionService(prisma as unknown as PrismaService, tokens, audit as unknown as AuditService);
  return { svc, prisma, audit, tokens };
}

const META = { ipHash: 'i'.repeat(64), userAgent: 'jest' };

describe('SessionService.rotate', () => {
  it('token mal formado o desconocido → invalid sin tocar nada', async () => {
    const { svc, prisma } = setup(row());
    await expect(svc.rotate(null, META)).resolves.toEqual({ kind: 'invalid' });
    await expect(svc.rotate('corto', META)).resolves.toEqual({ kind: 'invalid' });
    await expect(svc.rotate('B'.repeat(43), META)).resolves.toEqual({ kind: 'invalid' });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rota con compare-and-set y emite un access token de la misma familia', async () => {
    const r = row();
    const { svc, prisma, tokens } = setup(r);
    const res = await svc.rotate(RAW, META);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.refreshToken).not.toBe(RAW);
    expect(res.expiresAt.getTime()).toBeLessThanOrEqual(r.familyExpiresAt.getTime());
    expect(tokens.verifyAccess(res.accessToken)).toEqual({ sub: USER.id, tv: 3, sid: r.familyId });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: r.id, replacedAt: null, revokedAt: null },
      data: expect.objectContaining({ replacedById: 'crt00000000000000000000002' }),
    });
    const created = (prisma.refreshToken.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(created.tokenHash).toBe(sha256Hex(res.refreshToken));
    expect(created.familyId).toBe(r.familyId);
  });

  it('si otro proceso ganó el compare-and-set → race', async () => {
    const { svc } = setup(row(), { casCount: 0 });
    await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'race' });
  });

  it('token ya rotado dentro de la gracia → race; la tercera vez revoca la familia', async () => {
    const r = row({ replacedAt: new Date(Date.now() - 2_000), replacedById: 'crt00000000000000000000002' });
    const { svc, prisma, audit } = setup(r, { successor: { replacedAt: null } });
    await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'race' });
    await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'race' });
    await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'invalid' });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: r.familyId, revokedAt: null },
      data: expect.objectContaining({ revokeReason: 'REUSE_DETECTED' }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'security.refresh_reuse', metadata: { reason: 'race_limit' } }));
  });

  it('reuso pasada la gracia → revoca la familia y audita', async () => {
    const r = row({ replacedAt: new Date(Date.now() - REFRESH_GRACE_MS - 1_000), replacedById: 'crt00000000000000000000002' });
    const { svc, prisma, audit } = setup(r, { successor: { replacedAt: null } });
    await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'invalid' });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: r.familyId, revokedAt: null },
      data: expect.objectContaining({ revokeReason: 'REUSE_DETECTED' }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'security.refresh_reuse', metadata: { reason: 'after_grace' } }));
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('dentro de la gracia pero con el sucesor ya usado → es reuso', async () => {
    const r = row({ replacedAt: new Date(Date.now() - 1_000), replacedById: 'crt00000000000000000000002' });
    const { svc, audit } = setup(r, { successor: { replacedAt: new Date() } });
    await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'invalid' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reason: 'successor_used' } }));
  });

  it('revocado, vencido por inactividad, vencido absoluto o usuario suspendido → invalid', async () => {
    const past = new Date(Date.now() - 1_000);
    for (const r of [
      row({ revokedAt: past }),
      row({ expiresAt: past }),
      row({ familyExpiresAt: past }),
      row({ user: { ...USER, status: 'SUSPENDED' } }),
    ]) {
      const { svc, prisma } = setup(r);
      await expect(svc.rotate(RAW, META)).resolves.toEqual({ kind: 'invalid' });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    }
  });

  it('el admin rota con 1 día de inactividad máxima', async () => {
    const { svc } = setup(row({ user: { ...USER, role: 'ADMIN' } }));
    const res = await svc.rotate(RAW, META);
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(Math.abs(res.expiresAt.getTime() - (Date.now() + DAY))).toBeLessThan(5_000);
  });
});

describe('SessionService.create', () => {
  it('USER: 7 días de inactividad y 30 absolutos; ADMIN: 1 y 7', async () => {
    const { svc, prisma } = setup(null);
    const u = await svc.create({ id: USER.id, role: 'USER', tokenVersion: 0 }, META);
    expect(Math.round((u.expiresAt.getTime() - Date.now()) / DAY)).toBe(7);
    expect(Math.round((u.familyExpiresAt.getTime() - Date.now()) / DAY)).toBe(30);
    expect(u.familyId).toMatch(/^[a-f0-9]{30}$/);
    const a = await svc.create({ id: USER.id, role: 'ADMIN', tokenVersion: 0 }, META);
    expect(Math.round((a.expiresAt.getTime() - Date.now()) / DAY)).toBe(1);
    expect(Math.round((a.familyExpiresAt.getTime() - Date.now()) / DAY)).toBe(7);
    // Solo el hash llega a la BD.
    const data = (prisma.refreshToken.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.tokenHash).toBe(sha256Hex(u.refreshToken));
    expect(JSON.stringify(data)).not.toContain(u.refreshToken);
  });
});
