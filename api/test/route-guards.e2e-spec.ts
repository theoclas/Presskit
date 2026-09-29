// Matriz de guards: recorre TODAS las rutas registradas en Nest (no una lista escrita a mano)
// y comprueba que ninguna ruta nueva quede abierta por olvido:
// - sin token, toda ruta que no sea @Public responde 401;
// - /api/admin/** responde 403 a un USER y /api/me/** responde 403 al ADMIN;
// - las rutas @Public solo existen en los prefijos que deben ser anónimos.
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../src/common/decorators';
import { TestUsers, createTestApp, nextIp, type TestApp } from './auth.e2e-helpers';

interface RouteInfo {
  method: string;
  path: string;
  isPublic: boolean;
}

/** Prefijos donde se permite @Public (todo lo demás debe exigir sesión). */
const PUBLIC_ALLOWED = [
  /^\/api\/health(\/|$)/,
  /^\/api\/public\//,
  /^\/api\/media\/preview\//,
  /^\/api\/auth\/(login|mfa|refresh|logout|forgot-password|reset-password|register|verify-email)$/,
];

const DUMMY_ID = 'cxxxxxxxxxxxxxxxxxxxxxxx1';

function join(...parts: string[]): string {
  return `/${parts.join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function collectRoutes(t: TestApp): RouteInfo[] {
  const discovery = t.app.get(DiscoveryService);
  const scanner = t.app.get(MetadataScanner);
  const reflector = t.app.get(Reflector);
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const ctrl = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
    if (!ctrl || !wrapper.instance) continue;
    const raw = Reflect.getMetadata(PATH_METADATA, ctrl) as string | string[] | undefined;
    const bases = Array.isArray(raw) ? raw : [raw ?? ''];
    const proto = Object.getPrototypeOf(wrapper.instance) as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name] as (...args: unknown[]) => unknown;
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (methodPath === undefined || method === undefined) continue;
      const isPublic = !!reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, ctrl]);
      for (const base of bases) {
        for (const mp of Array.isArray(methodPath) ? methodPath : [methodPath]) {
          routes.push({ method: RequestMethod[method], path: join('api', base, mp), isPublic });
        }
      }
    }
  }
  return routes;
}

/** /api/me cubre /api/me/... pero no /api/media/... */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Ruta concreta para pedir: parámetros con un id de forma válida. */
function concrete(path: string): string {
  return path.replace(/\{\*[^}]+\}/g, 'x').replace(/:[A-Za-z0-9_]+/g, DUMMY_ID).replace(/[{}]/g, '');
}

describe('Matriz de guards (e2e)', () => {
  let t: TestApp;
  let users: TestUsers;
  let routes: RouteInfo[];
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    users = new TestUsers(t.prisma, t.config);
    routes = collectRoutes(t);
    userToken = await users.session(t.app, await users.create(), 'USER');
    adminToken = await users.session(t.app, await users.create({ role: 'ADMIN' }), 'ADMIN');
  });

  afterAll(async () => {
    await users?.cleanup();
    await t?.app.close();
  });

  const call = (r: RouteInfo, token?: string) => {
    const m = r.method.toLowerCase();
    const method = (['get', 'post', 'put', 'patch', 'delete'].includes(m) ? m : 'get') as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const req = t.http[method](concrete(r.path)).set('Origin', t.origin).set('X-Forwarded-For', nextIp());
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  it('encuentra las rutas de auth y las públicas de M1', () => {
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        'POST /api/auth/login',
        'POST /api/auth/refresh',
        'GET /api/auth/me',
        'POST /api/auth/step-up',
        'GET /api/public/djs',
        'GET /api/health',
      ]),
    );
    // Útil al leer la salida del CI.
    console.log(
      `rutas: ${routes.length} (públicas ${routes.filter((r) => r.isPublic).length}, ` +
        `admin ${routes.filter((r) => isUnder(r.path, '/api/admin')).length}, me ${routes.filter((r) => isUnder(r.path, '/api/me')).length})`,
    );
  });

  it('@Public solo en los prefijos anónimos (nunca en /api/admin ni /api/me)', () => {
    const offenders = routes.filter((r) => r.isPublic && !PUBLIC_ALLOWED.some((re) => re.test(r.path)));
    expect(offenders.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('los tokens de prueba son válidos (si no, los 403 de abajo no probarían nada)', async () => {
    await t.http.get('/api/auth/me').set('Authorization', `Bearer ${userToken}`).expect(200);
    await t.http.get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });

  it('toda ruta que no es @Public responde 401 sin token', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => !x.isPublic)) {
      const res = await call(r);
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('toda ruta /api/admin/** responde 403 a un USER', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => isUnder(x.path, '/api/admin'))) {
      const res = await call(r, userToken);
      if (res.status !== 403) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('toda ruta /api/me/** responde 403 al ADMIN', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => isUnder(x.path, '/api/me'))) {
      const res = await call(r, adminToken);
      if (res.status !== 403) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});
