import type { MeDto, SessionDto } from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { RequireAuth } from '../src/auth/guards';
import { applySession, clearLocalSession, http, rawHttp } from '../src/lib/http';

function me(over: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u_000000000000000000000001',
    username: 'fersua',
    email: null,
    emailVerified: false,
    role: 'ADMIN',
    mustChangePassword: false,
    mfaEnabled: true,
    profile: null,
    termsVersion: null,
    ...over,
  };
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) return Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response));
  return Promise.resolve(response);
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderAdmin(entry = '/admin/usuarios') {
  window.history.replaceState(null, '', entry);
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [
          {
            path: '/admin/*',
            element: (
              <RequireAuth role="ADMIN" fallback={<p>Cargando…</p>}>
                <p>Zona del admin</p>
              </RequireAuth>
            ),
          },
          { path: '*', element: <Where /> },
        ],
      },
    ],
    { initialEntries: [entry] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('guard del admin', () => {
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearLocalSession();
    localStorage.clear();
    refresh = vi.fn(async (config: InternalAxiosRequestConfig) =>
      respond(config, 401, { statusCode: 401, code: 'REFRESH_INVALID', message: 'x' }),
    );
    rawHttp.defaults.adapter = refresh;
    http.defaults.adapter = async (config) => respond(config, 404, { statusCode: 404, code: 'NOT_FOUND', message: 'x' });
  });

  afterEach(() => {
    cleanup();
    clearLocalSession();
    window.history.replaceState(null, '', '/');
  });

  it('sin sesión (el refresh silencioso falla) redirige a /login?next=<ruta>', async () => {
    renderAdmin('/admin/usuarios');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Fadmin%2Fusuarios'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Zona del admin')).toBeNull();
  });

  it('un DJ (USER) ve la página 404 pública, no el admin', async () => {
    applySession({ accessToken: 't', expiresIn: 900, user: me({ role: 'USER', username: 'dj.uno' }) } satisfies SessionDto);
    renderAdmin('/admin/usuarios');
    expect(await screen.findByText('Página no encontrada')).toBeTruthy();
    expect(screen.queryByText('Zona del admin')).toBeNull();
  });

  it('con contraseña temporal pendiente manda a /cambiar-clave con next', async () => {
    applySession({ accessToken: 't', expiresIn: 900, user: me({ mustChangePassword: true }) });
    renderAdmin('/admin/generos');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/cambiar-clave?next=%2Fadmin%2Fgeneros'));
  });

  it('el ADMIN entra', async () => {
    applySession({ accessToken: 't', expiresIn: 900, user: me() });
    renderAdmin('/admin');
    expect(await screen.findByText('Zona del admin')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('al abrir /admin en una pestaña nueva recupera la sesión con la cookie (refresh silencioso)', async () => {
    refresh.mockImplementation(async (config: InternalAxiosRequestConfig) =>
      respond(config, 200, { accessToken: 'nuevo', expiresIn: 900, user: me() } satisfies SessionDto),
    );
    renderAdmin('/admin/auditoria');
    expect(screen.getByText('Cargando…')).toBeTruthy();
    expect(await screen.findByText('Zona del admin')).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
