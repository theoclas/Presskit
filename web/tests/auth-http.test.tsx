import type { MeDto, SessionDto } from '@fersua/shared';
import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type HttpModule = typeof import('../src/lib/http');

const admin: MeDto = {
  id: 'u_admin_000000000000000001',
  username: 'fersua',
  email: null,
  emailVerified: false,
  role: 'ADMIN',
  mustChangePassword: false,
  mfaEnabled: true,
  profile: null,
  termsVersion: null,
};

function session(token: string, expiresIn = 900): SessionDto {
  return { accessToken: token, expiresIn, user: admin };
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) {
    return Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response));
  }
  return Promise.resolve(response);
}

function networkError(config: InternalAxiosRequestConfig): Promise<never> {
  return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {}));
}

function header(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const h = AxiosHeaders.from(config.headers);
  const v = h.get(name);
  return typeof v === 'string' ? v : undefined;
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('lib/http', () => {
  let mod: HttpModule;
  let redirect: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Estado de módulo limpio en cada prueba (token, refresh en curso, marca).
    vi.resetModules();
    localStorage.clear();
    mod = await import('../src/lib/http');
    redirect = vi.fn();
    mod.setLoginRedirect(redirect);
    window.history.replaceState(null, '', '/admin/usuarios');
  });

  afterEach(() => {
    mod.setLoginRedirect(null);
    window.history.replaceState(null, '', '/');
  });

  it('N peticiones con 401 simultáneas hacen un solo POST /auth/refresh y se reintentan con el token nuevo', async () => {
    let refreshCalls = 0;
    const refreshAdapter: AxiosAdapter = async (config) => {
      expect(config.url).toBe('/auth/refresh');
      expect(header(config, 'X-Requested-With')).toBe('fersua');
      expect(config.withCredentials).toBe(true);
      refreshCalls += 1;
      await tick(20);
      return respond(config, 200, session('new-token'));
    };
    const seen: (string | undefined)[] = [];
    const apiAdapter: AxiosAdapter = async (config) => {
      const auth = header(config, 'Authorization');
      seen.push(auth);
      expect(header(config, 'X-Requested-With')).toBe('fersua');
      if (auth === 'Bearer new-token') return respond(config, 200, { ok: config.url });
      return respond(config, 401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Debes iniciar sesión.' });
    };
    mod.rawHttp.defaults.adapter = refreshAdapter;
    mod.http.defaults.adapter = apiAdapter;
    mod.applySession(session('old-token'));

    const N = 6;
    const results = await Promise.all(Array.from({ length: N }, (_, i) => mod.http.get(`/admin/cosa-${i}`)));

    expect(refreshCalls).toBe(1);
    expect(results.map((r) => (r.data as { ok: string }).ok)).toEqual(Array.from({ length: N }, (_, i) => `/admin/cosa-${i}`));
    expect(seen.filter((s) => s === 'Bearer old-token')).toHaveLength(N);
    expect(seen.filter((s) => s === 'Bearer new-token')).toHaveLength(N);
    expect(mod.getAccessToken()).toBe('new-token');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('si el refresh falla, limpia la sesión y redirige una sola vez a /login?next=<ruta segura>', async () => {
    let refreshCalls = 0;
    mod.rawHttp.defaults.adapter = async (config) => {
      refreshCalls += 1;
      await tick(10);
      return respond(config, 401, { statusCode: 401, code: 'REFRESH_INVALID', message: 'Sesión vencida.' });
    };
    mod.http.defaults.adapter = async (config) =>
      respond(config, 401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Debes iniciar sesión.' });
    mod.applySession(session('old-token'));
    const events: string[] = [];
    mod.onSessionEvent((e) => events.push(e.type === 'cleared' ? `cleared:${e.reason}` : e.type));

    const settled = await Promise.allSettled([mod.http.get('/admin/a'), mod.http.get('/admin/b'), mod.http.get('/admin/c')]);

    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/login?next=%2Fadmin%2Fusuarios');
    expect(mod.getAccessToken()).toBeNull();
    expect(mod.hasSessionHint()).toBe(false);
    expect(events).toContain('cleared:expired');
  });

  it('en una ruta que no es del panel ni del admin, redirige a /login sin next', async () => {
    window.history.replaceState(null, '', '/_preview');
    mod.rawHttp.defaults.adapter = async (config) =>
      respond(config, 401, { statusCode: 401, code: 'REFRESH_INVALID', message: 'x' });
    mod.http.defaults.adapter = async (config) => respond(config, 401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x' });

    await expect(mod.http.get('/admin/profiles/abc/preview')).rejects.toBeTruthy();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('un error de red en el refresh no cierra la sesión', async () => {
    mod.rawHttp.defaults.adapter = async (config) => networkError(config);
    mod.http.defaults.adapter = async (config) => respond(config, 401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x' });
    mod.applySession(session('old-token'));

    await expect(mod.http.get('/admin/stats')).rejects.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(mod.getAccessToken()).toBe('old-token');
    expect(mod.hasSessionHint()).toBe(true);
  });

  it('un 401 de login, mfa, step-up o cambio de contraseña no dispara refresh', async () => {
    const refresh = vi.fn(async (config: InternalAxiosRequestConfig) => respond(config, 200, session('new-token')));
    mod.rawHttp.defaults.adapter = refresh;
    mod.http.defaults.adapter = async (config) =>
      respond(config, 401, { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos.' });
    mod.applySession(session('old-token'));

    for (const url of ['/auth/login', '/auth/mfa', '/auth/step-up', '/auth/change-password']) {
      await expect(mod.http.post(url, {})).rejects.toBeTruthy();
    }
    expect(refresh).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('en step-up, un 401 de sesión vencida (no de credenciales) sí renueva y reintenta una vez', async () => {
    let refreshCalls = 0;
    mod.rawHttp.defaults.adapter = async (config) => {
      refreshCalls += 1;
      return respond(config, 200, session('new-token'));
    };
    let attempts = 0;
    mod.http.defaults.adapter = async (config) => {
      attempts += 1;
      return header(config, 'Authorization') === 'Bearer new-token'
        ? respond(config, 200, { stepUpToken: 'su', expiresIn: 300 })
        : respond(config, 401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Tu sesión expiró.' });
    };
    mod.applySession(session('old-token'));

    const res = await mod.http.post('/auth/step-up', { password: 'x', code: '123456' });
    expect(res.data).toEqual({ stepUpToken: 'su', expiresIn: 300 });
    expect(refreshCalls).toBe(1);
    expect(attempts).toBe(2);
  });

  it('renueva antes de tiempo si al token le quedan menos de 30 s', async () => {
    let refreshCalls = 0;
    mod.rawHttp.defaults.adapter = async (config) => {
      refreshCalls += 1;
      return respond(config, 200, session('fresh-token'));
    };
    const seen: (string | undefined)[] = [];
    mod.http.defaults.adapter = async (config) => {
      seen.push(header(config, 'Authorization'));
      return respond(config, 200, {});
    };
    mod.applySession(session('about-to-expire', 10));

    await mod.http.get('/admin/stats');
    expect(refreshCalls).toBe(1);
    expect(seen).toEqual(['Bearer fresh-token']);
  });

  it('apiError normaliza respuestas del api y errores de red', async () => {
    mod.http.defaults.adapter = async (config) =>
      config.url === '/red'
        ? networkError(config)
        : respond(config, 409, { statusCode: 409, code: 'USERNAME_TAKEN', message: 'Ese nombre de usuario ya existe.' });

    const conflict = await mod.http.post('/admin/users', {}).catch((e: unknown) => e);
    expect(mod.apiError(conflict)).toEqual({ statusCode: 409, code: 'USERNAME_TAKEN', message: 'Ese nombre de usuario ya existe.' });

    const network = await mod.http.get('/red').catch((e: unknown) => e);
    expect(mod.apiError(network)).toMatchObject({ statusCode: 0, code: 'NETWORK' });

    expect(mod.apiError(new Error('x'))).toMatchObject({ code: 'UNKNOWN' });
  });

  it('nunca guarda el token en el storage: solo la marca fs_session', () => {
    mod.applySession(session('secret-token'));
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie;
    expect(dump).not.toContain('secret-token');
    expect(localStorage.getItem('fs_session')).toBe('1');
    mod.endLocalSession();
    expect(localStorage.getItem('fs_session')).toBeNull();
  });
});
