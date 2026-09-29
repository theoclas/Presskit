import { AdminOnlyGuard } from './admin-only.guard';
import { CuidPipe, IntIdPipe, bogotaDayStart, createdAtRange, pageArgs, searchTerm } from './admin-common';
import { actionFilter, toAuditLogDto } from './audit/admin-audit.service';
import type { ExecutionContext } from '@nestjs/common';

describe('pageArgs', () => {
  it('por defecto página 1 de 20', () => {
    expect(pageArgs({})).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(pageArgs({ page: 3, pageSize: 50 })).toEqual({ page: 3, pageSize: 50, skip: 100, take: 50 });
  });
});

describe('createdAtRange (días de Bogotá)', () => {
  it('medianoche de Bogotá es 05:00 UTC', () => {
    expect(bogotaDayStart('2026-09-29').toISOString()).toBe('2026-09-29T05:00:00.000Z');
  });

  it('from y to inclusive', () => {
    expect(createdAtRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      gte: new Date('2026-09-01T05:00:00.000Z'),
      lt: new Date('2026-10-01T05:00:00.000Z'),
    });
  });

  it('solo uno de los dos, o ninguno', () => {
    expect(createdAtRange({ from: '2026-09-01' })).toEqual({ gte: new Date('2026-09-01T05:00:00.000Z') });
    expect(createdAtRange({})).toBeNull();
  });

  it('fechas imposibles → 400', () => {
    expect(() => createdAtRange({ from: '2026-02-30' })).toThrow();
  });
});

describe('searchTerm', () => {
  it("recorta y trata '' como sin filtro", () => {
    expect(searchTerm('  ana ')).toBe('ana');
    expect(searchTerm('   ')).toBeNull();
    expect(searchTerm(undefined)).toBeNull();
    expect(() => searchTerm('ana \ud83d')).toThrow();
  });
});

describe('pipes de id', () => {
  it('CuidPipe: solo forma de cuid, si no 404', () => {
    const pipe = new CuidPipe();
    expect(pipe.transform('cmg4m8x2p0000abcdefghijkl')).toBe('cmg4m8x2p0000abcdefghijkl');
    for (const bad of ['', '../etc', 'CMG4M8X2P0000ABCDEFGHIJKL', 'a'.repeat(33), 1]) {
      expect(() => pipe.transform(bad)).toThrow(expect.objectContaining({ status: 404 }));
    }
  });

  it('IntIdPipe: entero positivo razonable, si no 404', () => {
    const pipe = new IntIdPipe();
    expect(pipe.transform('12')).toBe(12);
    // Ya convertido por el ValidationPipe global.
    expect(pipe.transform(12)).toBe(12);
    for (const bad of ['0', '-1', '1.5', '01', '9999999999', 'abc', Number.NaN, 1.5, -3, 0]) {
      expect(() => pipe.transform(bad)).toThrow(expect.objectContaining({ status: 404 }));
    }
  });
});

describe('actionFilter', () => {
  it('exacta o por prefijo', () => {
    expect(actionFilter('admin.user.create')).toBe('admin.user.create');
    expect(actionFilter('admin.user.')).toEqual({ startsWith: 'admin.user.' });
    expect(actionFilter('admin.*')).toEqual({ startsWith: 'admin.' });
  });
});

describe('toAuditLogDto', () => {
  it('el id BigInt sale como string y sin ipHash', () => {
    const dto = toAuditLogDto({
      id: 9007199254740993n,
      actorUsername: 'fersua',
      action: 'admin.user.create',
      targetType: 'User',
      targetId: 'cuser0000000000000000001',
      profileId: null,
      metadata: { hasEmail: true },
      createdAt: new Date('2026-09-29T12:00:00.000Z'),
    });
    expect(dto.id).toBe('9007199254740993');
    expect(dto).not.toHaveProperty('ipHash');
  });
});

describe('AdminOnlyGuard', () => {
  const ctx = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const guard = new AdminOnlyGuard();

  it('sin usuario → 401; USER → 403; ADMIN suspendido → 403; ADMIN activo pasa', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => guard.canActivate(ctx({ role: 'USER', status: 'ACTIVE' }))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => guard.canActivate(ctx({ role: 'ADMIN', status: 'SUSPENDED' }))).toThrow(expect.objectContaining({ status: 403 }));
    expect(guard.canActivate(ctx({ role: 'ADMIN', status: 'ACTIVE' }))).toBe(true);
  });
});
