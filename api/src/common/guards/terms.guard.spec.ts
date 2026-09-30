import type { ExecutionContext } from '@nestjs/common';
import { LEGAL_DOCS } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { isTermsOutdated } from '../../auth/terms';
import type { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../errors';
import { TermsGuard } from './terms.guard';

const CURRENT = { termsVersion: LEGAL_DOCS.artistTerms.version, privacyVersion: LEGAL_DOCS.privacy.version };

function user(role: 'USER' | 'ADMIN'): AuthUser {
  return { id: 'cuser1', username: 'dj.uno', role, status: 'ACTIVE', mustChangePassword: false, profileId: null, sessionFamilyId: 'a'.repeat(30) };
}

function ctx(path: string, u: AuthUser | undefined, type = 'http'): ExecutionContext {
  const req = { user: u, route: { path }, originalUrl: path, headers: {} };
  return { getType: () => type, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function guard(row: { role: 'USER' | 'ADMIN'; termsVersion: string | null; privacyVersion: string | null } | null) {
  const prisma = { user: { findUnique: jest.fn(async () => row) } };
  return { g: new TermsGuard(prisma as unknown as PrismaService), prisma };
}

async function expect403(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getStatus()).toBe(403);
    expect((err as AppError).code).toBe('TERMS_ACCEPTANCE_REQUIRED');
    return;
  }
  throw new Error('se esperaba 403 TERMS_ACCEPTANCE_REQUIRED');
}

describe('isTermsOutdated', () => {
  it('USER con versiones vigentes: false; cualquiera distinta o sin aceptar: true; ADMIN: siempre false', () => {
    expect(isTermsOutdated({ role: 'USER', ...CURRENT })).toBe(false);
    expect(isTermsOutdated({ role: 'USER', ...CURRENT, termsVersion: '2020-01' })).toBe(true);
    expect(isTermsOutdated({ role: 'USER', ...CURRENT, privacyVersion: '2020-01' })).toBe(true);
    expect(isTermsOutdated({ role: 'USER', termsVersion: null, privacyVersion: null })).toBe(true);
    expect(isTermsOutdated({ role: 'ADMIN', termsVersion: null, privacyVersion: null })).toBe(false);
  });
});

describe('TermsGuard', () => {
  it('USER con términos viejos en /api/me/**: 403 TERMS_ACCEPTANCE_REQUIRED', async () => {
    const { g } = guard({ role: 'USER', termsVersion: '2020-01', privacyVersion: CURRENT.privacyVersion });
    await expect403(g.canActivate(ctx('/api/me/profile', user('USER'))));
    await expect403(g.canActivate(ctx('/api/me/profile/bookings/:id', user('USER'))));
    await expect403(g.canActivate(ctx('/api/me', user('USER'))));
  });

  it('USER al día en /api/me/**: pasa', async () => {
    const { g, prisma } = guard({ role: 'USER', ...CURRENT });
    await expect(g.canActivate(ctx('/api/me/profile', user('USER')))).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'cuser1' }, select: { role: true, termsVersion: true, privacyVersion: true } });
  });

  it('fuera de /api/me (auth, públicas, /api/media) no consulta nada: /auth/me y accept-terms siguen funcionando', async () => {
    const { g, prisma } = guard({ role: 'USER', termsVersion: null, privacyVersion: null });
    for (const path of ['/api/auth/me', '/api/auth/accept-terms', '/api/auth/logout-all', '/api/public/djs', '/api/media/preview/:a/:f', '/api/meh']) {
      await expect(g.canActivate(ctx(path, user('USER')))).resolves.toBe(true);
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('ADMIN, anónimo o contexto no HTTP: no aplica', async () => {
    const { g, prisma } = guard({ role: 'ADMIN', termsVersion: null, privacyVersion: null });
    await expect(g.canActivate(ctx('/api/me/profile', user('ADMIN')))).resolves.toBe(true);
    await expect(g.canActivate(ctx('/api/me/profile', undefined))).resolves.toBe(true);
    await expect(g.canActivate(ctx('/api/me/profile', user('USER'), 'rpc'))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('el usuario ya no existe: 401', async () => {
    const { g } = guard(null);
    await expect(g.canActivate(ctx('/api/me/profile', user('USER')))).rejects.toMatchObject({ status: 401 });
  });
});
