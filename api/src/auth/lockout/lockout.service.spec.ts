import type { AppConfig } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoundedMap } from '../bounded-map';
import { LockoutService, lockKey, mfaLockMinutes, pairLockMinutes, userSoftCapReached, type LockoutUser } from './lockout.service';

function makeService() {
  let count = 0;
  const updates: unknown[] = [];
  let mfaCount = 0;
  const prisma = {
    user: {
      update: jest.fn(async (args: { data: { failedLoginCount?: unknown; mfaFailedCount?: unknown } }) => {
        updates.push(args.data);
        if (args.data.failedLoginCount && typeof args.data.failedLoginCount === 'object') count++;
        if (args.data.failedLoginCount === 0) count = 0;
        if (args.data.mfaFailedCount && typeof args.data.mfaFailedCount === 'object') mfaCount++;
        if (args.data.mfaFailedCount === 0) mfaCount = 0;
        return { failedLoginCount: count, mfaFailedCount: mfaCount };
      }),
    },
  };
  const config = { jwtAccessSecret: 's'.repeat(64) } as AppConfig;
  const svc = new LockoutService(prisma as unknown as PrismaService, config);
  return { svc, prisma, updates, getCount: () => count };
}

const user = (over: Partial<LockoutUser> = {}): LockoutUser => ({
  id: 'cuser000000000000000000001',
  role: 'USER',
  failedLoginCount: 1,
  lockedUntil: null,
  ...over,
});

describe('matemática del bloqueo', () => {
  it('pareja: 15·2^(n−5) minutos desde el 5.º fallo, tope 240', () => {
    expect([1, 4, 5, 6, 7, 8, 9, 10, 20].map(pairLockMinutes)).toEqual([0, 0, 15, 30, 60, 120, 240, 240, 240]);
  });

  it('tope suave: cada 30 fallos seguidos del usuario', () => {
    expect([0, 1, 29, 30, 31, 59, 60].map(userSoftCapReached)).toEqual([false, false, false, true, false, false, true]);
  });

  it('2FA: 15·2^(n−3) minutos desde el 3.er código malo seguido, tope 240', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(mfaLockMinutes)).toEqual([0, 0, 15, 30, 60, 120, 240, 240, 240]);
  });
});

describe('LockoutService', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);

  it('5 fallos desde una red la bloquean solo a ella', async () => {
    const { svc } = makeService();
    const u = user();
    for (let i = 0; i < 4; i++) await svc.recordFailure(u, A);
    expect(svc.isBlocked(u, A, { knownDevice: false })).toBe(false);
    await svc.recordFailure(u, A);
    expect(svc.isBlocked(u, A, { knownDevice: false })).toBe(true);
    expect(svc.isBlocked(u, B, { knownDevice: false })).toBe(false);
    // El dispositivo conocido salta el bloqueo de la pareja.
    expect(svc.isBlocked(u, A, { knownDevice: true })).toBe(false);
  });

  it('el bloqueo de la pareja vence a los 15 min', async () => {
    const { svc } = makeService();
    const u = user();
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await svc.recordFailure(u, A, t0);
    expect(svc.isBlocked(u, A, { knownDevice: false }, t0 + 14 * 60_000)).toBe(true);
    expect(svc.isBlocked(u, A, { knownDevice: false }, t0 + 15 * 60_000 + 1)).toBe(false);
  });

  it('el contador en 0 (login correcto o desbloqueo por admin/CLI) limpia todas las parejas', async () => {
    const { svc } = makeService();
    const u = user();
    for (let i = 0; i < 5; i++) await svc.recordFailure(u, A);
    expect(svc.isBlocked(u, A, { knownDevice: false })).toBe(true);
    expect(svc.isBlocked({ ...u, failedLoginCount: 0 }, A, { knownDevice: false })).toBe(false);
    expect(svc.isBlocked(u, A, { knownDevice: false })).toBe(false);
  });

  it('el fallo 30 bloquea al USER 60 min en la BD (incremento atómico)', async () => {
    const { svc, prisma } = makeService();
    const u = user();
    let locked: Date | null = null;
    for (let i = 1; i <= 30; i++) {
      const r = await svc.recordFailure(u, `${i % 7}`.repeat(64));
      if (i < 30) expect(r.userLockedUntil).toBeNull();
      else locked = r.userLockedUntil;
    }
    expect(locked).toBeInstanceOf(Date);
    expect(locked!.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginCount: { increment: 1 } } }),
    );
    expect(svc.isBlocked({ ...u, failedLoginCount: 30, lockedUntil: locked }, 'z'.repeat(64), { knownDevice: false })).toBe(true);
    expect(svc.isBlocked({ ...u, failedLoginCount: 30, lockedUntil: locked }, 'z'.repeat(64), { knownDevice: true })).toBe(false);
  });

  it('el ADMIN nunca queda bloqueado para todas las redes', async () => {
    const { svc } = makeService();
    const admin = user({ id: 'cadmin00000000000000000001', role: 'ADMIN' });
    for (let i = 1; i <= 30; i++) {
      const r = await svc.recordFailure(admin, `${i % 7}`.repeat(64));
      expect(r.userLockedUntil).toBeNull();
    }
    const future = new Date(Date.now() + 3_600_000);
    expect(svc.isBlocked({ ...admin, lockedUntil: future }, 'y'.repeat(64), { knownDevice: false })).toBe(false);
  });

  it('mutex: una sola verificación en curso por flujo y usuario', () => {
    const { svc } = makeService();
    expect(svc.tryAcquire(lockKey('login', 'u1'))).toBe(true);
    expect(svc.tryAcquire(lockKey('login', 'u1'))).toBe(false);
    expect(svc.tryAcquire(lockKey('login', 'u2'))).toBe(true);
    // Un login anónimo en curso no bloquea el 2FA ni el step-up del mismo usuario.
    expect(svc.tryAcquire(lockKey('mfa', 'u1'))).toBe(true);
    expect(svc.tryAcquire(lockKey('stepup', 'u1'))).toBe(true);
    svc.release(lockKey('login', 'u1'));
    expect(svc.tryAcquire(lockKey('login', 'u1'))).toBe(true);
  });

  it('2FA: cuenta fallos en la BD, pausa desde el tercero y el dispositivo conocido la salta', async () => {
    const { svc } = makeService();
    const now = Date.now();
    expect(await svc.recordMfaFailure('u1', now)).toEqual({ failures: 1, lockedUntil: null });
    expect(await svc.recordMfaFailure('u1', now)).toEqual({ failures: 2, lockedUntil: null });
    const third = await svc.recordMfaFailure('u1', now);
    expect(third.failures).toBe(3);
    expect(third.lockedUntil?.getTime()).toBe(now + 15 * 60_000);
    const u = { mfaLockedUntil: third.lockedUntil };
    expect(svc.mfaPausedUntil(u, { knownDevice: false }, now)).toEqual(third.lockedUntil);
    expect(svc.mfaPausedUntil(u, { knownDevice: true }, now)).toBeNull();
    expect(svc.mfaPausedUntil(u, { knownDevice: false }, now + 16 * 60_000)).toBeNull();
  });

  it('cookie de dispositivo conocido: atada al usuario y a su tokenVersion, firmada y con vencimiento', () => {
    const { svc } = makeService();
    const now = Date.now();
    const id = 'cuser000000000000000000001';
    const { value, expires } = svc.issueDeviceToken(id, 4, now);
    expect(expires.getTime() - now).toBe(90 * 24 * 60 * 60 * 1000);
    expect(svc.isKnownDevice(value, id, 4, now)).toBe(true);
    expect(svc.isKnownDevice(value, 'cuser000000000000000000002', 4, now)).toBe(false);
    // Cambio de contraseña, reinicio o cerrar todas las sesiones (tokenVersion++): ya no sirve.
    expect(svc.isKnownDevice(value, id, 5, now)).toBe(false);
    const tampered = value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a');
    expect(svc.isKnownDevice(tampered, id, 4, now)).toBe(false);
    expect(svc.isKnownDevice(value, id, 4, now + 91 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(svc.isKnownDevice('basura', id, 4, now)).toBe(false);
    expect(svc.isKnownDevice(null, id, 4, now)).toBe(false);
  });
});

describe('BoundedMap', () => {
  it('vence entradas y descarta las más viejas al llenarse', () => {
    let t = 0;
    const m = new BoundedMap<string, number>(2, 100, () => t);
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3);
    expect(m.has('a')).toBe(false);
    expect(m.get('c')).toBe(3);
    t = 150;
    expect(m.get('b')).toBeUndefined();
    m.set('d', 4, 1_000);
    t = 900;
    expect(m.get('d')).toBe(4);
    m.deleteWhere((k) => k === 'd');
    m.sweep();
    expect(m.size).toBe(0);
  });
});
