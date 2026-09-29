import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthedRequest, AuthUser } from '../../auth/auth-user';
import { ALLOW_PENDING_PASSWORD_KEY, ROLES_KEY, STEP_UP_KEY } from '../../auth/decorators';
import { TokenService } from '../../auth/tokens/token.service';
import type { AppConfig } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators';
import { AppError } from '../errors';
import { JwtAuthGuard, extractBearer } from './jwt-auth.guard';
import { MustChangePasswordGuard } from './must-change-password.guard';
import { RolesGuard, roleForPath } from './roles.guard';
import { StepUpGuard } from './step-up.guard';

const UID = 'cuser000000000000000000001';
const SID = 'a'.repeat(30);
const tokens = new TokenService(new JwtService(), { jwtAccessSecret: 'k'.repeat(64) } as AppConfig);
const reflector = new Reflector();

function ctx(req: Partial<AuthedRequest> & Record<string, unknown>, meta: Record<string, unknown> = {}): ExecutionContext {
  const handler = function handler() {};
  class Ctrl {}
  for (const [k, v] of Object.entries(meta)) Reflect.defineMetadata(k, v, handler);
  // El mismo objeto: los guards escriben req.user en él.
  const request = req as Record<string, unknown>;
  request.headers ??= {};
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function dbUser(over: Record<string, unknown> = {}) {
  return {
    id: UID,
    username: 'dj.prueba',
    role: 'USER',
    status: 'ACTIVE',
    tokenVersion: 2,
    mustChangePassword: false,
    profile: { id: 'cprof000000000000000000001' },
    refreshTokens: [{ id: 'crt' }],
    ...over,
  };
}

function jwtGuard(found: unknown) {
  const prisma = { user: { findUnique: jest.fn(async () => found) } };
  return { guard: new JwtAuthGuard(reflector, tokens, prisma as unknown as PrismaService), prisma };
}

async function expectStatus(p: Promise<unknown> | (() => unknown), status: number, code?: string) {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getStatus()).toBe(status);
    if (code) expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error(`se esperaba ${status}`);
}

describe('JwtAuthGuard', () => {
  const bearer = (tv = 2) => ({ authorization: `Bearer ${tokens.signAccess({ sub: UID, tv, sid: SID })}` });

  it('rutas @Public pasan sin consultar la BD ni tocar req.user', async () => {
    const { guard, prisma } = jwtGuard(dbUser());
    const req = { headers: bearer() } as Record<string, unknown>;
    await expect(guard.canActivate(ctx(req, { [IS_PUBLIC_KEY]: true }))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('sin token, con basura o con otro tipo de token → 401', async () => {
    const { guard } = jwtGuard(dbUser());
    await expectStatus(guard.canActivate(ctx({})), 401);
    await expectStatus(guard.canActivate(ctx({ headers: { authorization: 'Bearer x.y.z' } })), 401);
    const mfa = tokens.signMfa({ sub: UID, tv: 2 }).token;
    await expectStatus(guard.canActivate(ctx({ headers: { authorization: `Bearer ${mfa}` } })), 401);
  });

  it('válido: relee de la BD y arma req.user (una consulta que incluye la familia sid)', async () => {
    const { guard, prisma } = jwtGuard(dbUser());
    const req = { headers: bearer() } as unknown as AuthedRequest;
    await expect(guard.canActivate(ctx(req as never))).resolves.toBe(true);
    expect(req.user).toEqual<AuthUser>({
      id: UID,
      username: 'dj.prueba',
      role: 'USER',
      status: 'ACTIVE',
      mustChangePassword: false,
      profileId: 'cprof000000000000000000001',
      sessionFamilyId: SID,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    const args = (prisma.user.findUnique.mock.calls[0] as unknown as [{ select: { refreshTokens: { where: Record<string, unknown> } } }])[0];
    expect(args.select.refreshTokens.where).toMatchObject({ familyId: SID, revokedAt: null, replacedAt: null });
  });

  it('tokenVersion distinto (logout-all, cambio de clave) → 401', async () => {
    const { guard } = jwtGuard(dbUser({ tokenVersion: 3 }));
    await expectStatus(guard.canActivate(ctx({ headers: bearer(2) })), 401);
  });

  it('usuario suspendido o borrado → 401', async () => {
    await expectStatus(jwtGuard(dbUser({ status: 'SUSPENDED' })).guard.canActivate(ctx({ headers: bearer() })), 401);
    await expectStatus(jwtGuard(null).guard.canActivate(ctx({ headers: bearer() })), 401);
  });

  it('familia revocada (logout) → 401 aunque el token siga vigente', async () => {
    const { guard } = jwtGuard(dbUser({ refreshTokens: [] }));
    await expectStatus(guard.canActivate(ctx({ headers: bearer() })), 401);
  });

  it('el ADMIN nunca trae profileId', async () => {
    const { guard } = jwtGuard(dbUser({ role: 'ADMIN' }));
    const req = { headers: bearer() } as unknown as AuthedRequest;
    await guard.canActivate(ctx(req as never));
    expect(req.user?.profileId).toBeNull();
  });

  it('extractBearer solo acepta "Bearer <jwt>" en el header', () => {
    expect(extractBearer({ headers: { authorization: 'Bearer a.b.c' } } as never)).toBe('a.b.c');
    expect(extractBearer({ headers: { authorization: 'Basic abc' } } as never)).toBeNull();
    expect(extractBearer({ headers: {} } as never)).toBeNull();
  });
});

const authUser = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: UID,
  username: 'dj.prueba',
  role: 'USER',
  status: 'ACTIVE',
  mustChangePassword: false,
  profileId: null,
  sessionFamilyId: SID,
  ...over,
});

describe('MustChangePasswordGuard', () => {
  const guard = new MustChangePasswordGuard(reflector);

  it('con contraseña temporal pendiente: 403 salvo @AllowPendingPasswordChange', async () => {
    const user = authUser({ mustChangePassword: true });
    await expectStatus(() => guard.canActivate(ctx({ user })), 403, 'PASSWORD_CHANGE_REQUIRED');
    expect(guard.canActivate(ctx({ user }, { [ALLOW_PENDING_PASSWORD_KEY]: true }))).toBe(true);
  });

  it('sin pendiente o sin usuario (ruta pública) pasa', () => {
    expect(guard.canActivate(ctx({ user: authUser() }))).toBe(true);
    expect(guard.canActivate(ctx({}))).toBe(true);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(reflector);

  it('prefijo: /api/admin solo ADMIN y /api/me solo USER (aunque falte @Roles)', async () => {
    const adminRoute = { route: { path: '/api/admin/users' } };
    await expectStatus(() => guard.canActivate(ctx({ ...adminRoute, user: authUser() })), 403);
    expect(guard.canActivate(ctx({ ...adminRoute, user: authUser({ role: 'ADMIN' }) }))).toBe(true);
    await expectStatus(() => guard.canActivate(ctx({ ...adminRoute })), 401);

    const meRoute = { route: { path: '/api/me/profile' } };
    await expectStatus(() => guard.canActivate(ctx({ ...meRoute, user: authUser({ role: 'ADMIN' }) })), 403);
    expect(guard.canActivate(ctx({ ...meRoute, user: authUser() }))).toBe(true);
  });

  it('sin route usa la URL en minúsculas (Express no distingue mayúsculas)', async () => {
    await expectStatus(() => guard.canActivate(ctx({ originalUrl: '/API/Admin/users?x=1', user: authUser() })), 403);
    expect(roleForPath('/api/administrador')).toBeNull();
    expect(roleForPath('/api/me')).toBe('USER');
    expect(roleForPath('/api/media/preview/x/y')).toBeNull();
  });

  it('@Roles se compara con el rol de la BD', async () => {
    const meta = { [ROLES_KEY]: ['ADMIN'] };
    const route = { route: { path: '/api/auth/step-up' } };
    await expectStatus(() => guard.canActivate(ctx({ ...route, user: authUser() }, meta)), 403);
    expect(guard.canActivate(ctx({ ...route, user: authUser({ role: 'ADMIN' }) }, meta))).toBe(true);
    expect(guard.canActivate(ctx({ ...route, user: authUser() }))).toBe(true);
  });
});

describe('StepUpGuard', () => {
  const guard = new StepUpGuard(reflector, tokens);
  const meta = { [STEP_UP_KEY]: true };
  const admin = authUser({ role: 'ADMIN' });

  it('sin la metadata no hace nada', () => {
    expect(guard.canActivate(ctx({ user: admin }))).toBe(true);
  });

  it('exige X-Step-Up del mismo usuario y la misma sesión', async () => {
    const good = tokens.signStepUp({ sub: admin.id, sid: SID });
    expect(guard.canActivate(ctx({ user: admin, headers: { 'x-step-up': good } }, meta))).toBe(true);
    await expectStatus(() => guard.canActivate(ctx({ user: admin }, meta)), 403, 'STEP_UP_REQUIRED');
    const otherSession = tokens.signStepUp({ sub: admin.id, sid: 'b'.repeat(30) });
    await expectStatus(() => guard.canActivate(ctx({ user: admin, headers: { 'x-step-up': otherSession } }, meta)), 403);
    // Un access token no sirve como step-up.
    const access = tokens.signAccess({ sub: admin.id, tv: 0, sid: SID });
    await expectStatus(() => guard.canActivate(ctx({ user: admin, headers: { 'x-step-up': access } }, meta)), 403);
    await expectStatus(() => guard.canActivate(ctx({}, meta)), 401);
  });
});

describe('TokenService', () => {
  it('cada propósito tiene su audiencia y secreto: no se intercambian', () => {
    const access = tokens.signAccess({ sub: UID, tv: 1, sid: SID });
    const { token: mfa, jti } = tokens.signMfa({ sub: UID, tv: 1 });
    expect(tokens.verifyAccess(access)).toEqual({ sub: UID, tv: 1, sid: SID });
    expect(tokens.verifyMfa(mfa)).toEqual({ sub: UID, tv: 1, jti });
    expect(tokens.verifyAccess(mfa)).toBeNull();
    expect(tokens.verifyMfa(access)).toBeNull();
  });

  it('rechaza alg "none", otra firma y tokens de otro secreto', () => {
    const access = tokens.signAccess({ sub: UID, tv: 1, sid: SID });
    const [h, p] = access.split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
    expect(tokens.verifyAccess(none)).toBeNull();
    expect(tokens.verifyAccess(`${h}.${p}.AAAA`)).toBeNull();
    const other = new TokenService(new JwtService(), { jwtAccessSecret: 'z'.repeat(64) } as AppConfig);
    expect(other.verifyAccess(access)).toBeNull();
  });
});
