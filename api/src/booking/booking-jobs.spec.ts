import { Logger } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BookingDigestJob, BookingRetentionJob, previousUtcDay } from './booking-jobs';

const DAY = 86_400_000;

describe('previousUtcDay', () => {
  it('el día UTC anterior, sin importar la hora de Bogotá', () => {
    // 08:00 en Bogotá = 13:00 UTC.
    const { start, end } = previousUtcDay(new Date('2026-10-02T13:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });
});

describe('BookingRetentionJob', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  function setup(batches: string[][]) {
    const queue = [...batches];
    const findMany = jest.fn(async () => (queue.shift() ?? []).map((id) => ({ id })));
    const deleteMany = jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
    const prisma = { bookingRequest: { findMany, deleteMany } } as unknown as PrismaService;
    const record = jest.fn(async () => undefined);
    const job = new BookingRetentionJob(prisma, { record } as unknown as AuditService);
    return { job, findMany, deleteMany, record };
  }

  it('borra las de más de 12 meses y el SPAM de más de 30 días, y audita solo los conteos', async () => {
    const now = new Date('2026-10-02T09:30:00Z');
    const { job, findMany, record } = setup([['a', 'b'], ['s1']]);
    expect(await job.purge(now)).toEqual({ expired: 2, spam: 1 });
    const [expiredWhere, spamWhere] = findMany.mock.calls.map((c) => (c as unknown as [{ where: Record<string, unknown> }])[0].where);
    expect(expiredWhere).toEqual({ createdAt: { lt: new Date('2025-10-02T09:30:00Z') } });
    expect(spamWhere).toEqual({ status: 'SPAM', createdAt: { lt: new Date(now.getTime() - 30 * DAY) } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'system.booking.retention_purged', metadata: { expired: 2, spam: 1 } }));
  });

  it('sin nada que borrar no audita', async () => {
    const { job, record } = setup([]);
    expect(await job.purge(new Date())).toEqual({ expired: 0, spam: 0 });
    expect(record).not.toHaveBeenCalled();
  });

  it('borra en lotes de 500 hasta vaciar', async () => {
    const full = Array.from({ length: 500 }, (_, i) => `x${i}`);
    const { job, deleteMany } = setup([full, ['y'], []]);
    expect((await job.purge(new Date())).expired).toBe(501);
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe('BookingDigestJob', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  const owner = (over: Record<string, unknown> = {}) => ({
    notifyByEmail: true,
    user: { email: 'dj@example.com', emailVerifiedAt: new Date(), role: 'USER', status: 'ACTIVE', ...over },
  });

  function setup(groups: { profileId: string; n: number }[], profiles: Record<string, unknown>, unread: Record<string, number>) {
    const prisma = {
      bookingRequest: {
        groupBy: jest.fn(async () => groups.map((g) => ({ profileId: g.profileId, _count: { _all: g.n } }))),
        count: jest.fn(async ({ where }: { where: { profileId: string } }) => unread[where.profileId] ?? 0),
      },
      djProfile: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => profiles[where.id] ?? null) },
    } as unknown as PrismaService;
    const send = jest.fn(() => true);
    return { job: new BookingDigestJob(prisma, { send } as unknown as MailService), send, prisma };
  }

  it('solo a quien pasó el tope de avisos ayer y todavía tiene solicitudes sin leer; solo el número', async () => {
    const { job, send, prisma } = setup(
      [
        { profileId: 'p-over', n: 7 },
        { profileId: 'p-cap', n: 5 },
        { profileId: 'p-read', n: 9 },
        { profileId: 'p-off', n: 9 },
        { profileId: 'p-unverified', n: 9 },
      ],
      {
        'p-over': owner(),
        'p-cap': owner(),
        'p-read': owner(),
        'p-off': { ...owner(), notifyByEmail: false },
        'p-unverified': owner({ emailVerifiedAt: null }),
      },
      { 'p-over': 3, 'p-cap': 4, 'p-read': 0, 'p-off': 5, 'p-unverified': 5 },
    );
    expect(await job.run(new Date('2026-10-02T13:00:00Z'))).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('dj@example.com', 'booking-digest-owner', { count: 3 });
    const groupBy = (prisma as unknown as { bookingRequest: { groupBy: jest.Mock } }).bookingRequest.groupBy;
    expect(groupBy.mock.calls[0][0].where).toEqual({
      createdAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-10-02T00:00:00Z') },
      status: { not: 'SPAM' },
    });
  });
});
