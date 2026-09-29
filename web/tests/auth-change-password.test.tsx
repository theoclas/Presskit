import type { MeDto, SessionDto } from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ChangePasswordPage } from '../src/auth/ChangePasswordPage';
import { applySession, clearLocalSession, getSessionUser, http, rawHttp } from '../src/lib/http';

function me(over: Partial<MeDto> = {}): MeDto {
  return {
    id: 'cadmin000000000000000000001',
    username: 'fersua',
    email: null,
    emailVerified: false,
    role: 'ADMIN',
    mustChangePassword: true,
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

function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [
          { path: '/cambiar-clave', element: <ChangePasswordPage /> },
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

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}

describe('/cambiar-clave', () => {
  let posted: unknown[];

  beforeEach(() => {
    clearLocalSession();
    localStorage.clear();
    posted = [];
    const adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/change-password') {
        const body = JSON.parse(String(config.data)) as { currentPassword: string; newPassword: string };
        posted.push(body);
        if (body.currentPassword !== 'Temporal-1234') {
          return respond(config, 401, { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'La contraseña actual no es correcta.' });
        }
        return respond(config, 200, { accessToken: 'nuevo', expiresIn: 900, user: me({ mustChangePassword: false }) } satisfies SessionDto);
      }
      return respond(config, 404, { statusCode: 404, code: 'NOT_FOUND', message: 'x' });
    };
    http.defaults.adapter = adapter;
    rawHttp.defaults.adapter = adapter;
    applySession({ accessToken: 'tok', expiresIn: 900, user: me() });
  });

  afterEach(() => {
    cleanup();
    clearLocalSession();
  });

  it('el admin necesita 12 caracteres; la regla se valida antes de llamar al api', async () => {
    renderAt('/cambiar-clave?next=%2Fadmin%2Fusuarios');
    expect(await screen.findByText('Crea tu contraseña')).toBeTruthy();
    expect(screen.getByText('Al menos 12 caracteres')).toBeTruthy();
    fill('Temporal-1234', 'corta-9x7k');
    expect(await screen.findByText('Usa al menos 12 caracteres.')).toBeTruthy();
    expect(posted).toEqual([]);
  });

  it('contraseña temporal incorrecta: error en ese campo y no avanza', async () => {
    renderAt('/cambiar-clave?next=%2Fadmin%2Fusuarios');
    fill('otra-cosa-123', 'Una-clave-nueva-larga-42');
    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy();
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('al guardar, toma la sesión nueva y sigue a next (si es seguro)', async () => {
    renderAt('/cambiar-clave?next=%2Fadmin%2Fusuarios');
    fill('Temporal-1234', 'Una-clave-nueva-larga-42');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/usuarios'));
    expect(posted).toEqual([{ currentPassword: 'Temporal-1234', newPassword: 'Una-clave-nueva-larga-42' }]);
    expect(getSessionUser()?.mustChangePassword).toBe(false);
  });

  it('ignora un next externo', async () => {
    renderAt('/cambiar-clave?next=https%3A%2F%2Fevil.example');
    fill('Temporal-1234', 'Una-clave-nueva-larga-42');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin'));
  });
});
