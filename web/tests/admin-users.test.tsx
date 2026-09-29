import type { AdminUserDto, MeDto, Paginated, TemporaryPasswordDto } from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from '../src/admin/pages/UsersPage';
import { AuthProvider } from '../src/auth/AuthProvider';
import { StepUpProvider, invalidateStepUp } from '../src/auth/useStepUp';
import { applySession, clearLocalSession, http, rawHttp } from '../src/lib/http';

const TEMP = 'Tmp-Qx7v-9Lp2-Wz4k';

const admin: MeDto = {
  id: 'cadmin000000000000000000001',
  username: 'fersua',
  email: null,
  emailVerified: false,
  role: 'ADMIN',
  mustChangePassword: false,
  mfaEnabled: true,
  profile: null,
  termsVersion: null,
};

const dj: AdminUserDto = {
  id: 'cdjuno0000000000000000001',
  username: 'dj.uno',
  email: 'dj@example.com',
  emailVerified: false,
  role: 'USER',
  status: 'ACTIVE',
  mustChangePassword: false,
  tempPasswordExpiresAt: null,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: '2026-09-01T15:00:00.000Z',
  profile: null,
};

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) return Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response));
  return Promise.resolve(response);
}

interface Call {
  method: string;
  url: string;
  body: unknown;
  stepUp: string | undefined;
}

let calls: Call[];
let client: QueryClient;
let writeText: ReturnType<typeof vi.fn>;

function tempPassword(username: string): TemporaryPasswordDto {
  return { userId: dj.id, username, temporaryPassword: TEMP, expiresAt: '2026-10-02T15:00:00.000Z' };
}

function renderPage() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/usuarios']}>
        <AuthProvider>
          <ConfigProvider theme={{ token: { motion: false } }}>
            <AntApp>
              <StepUpProvider>
                <UsersPage />
              </StepUpProvider>
            </AntApp>
          </ConfigProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// getByRole es muy lento con el DOM de AntD en jsdom: se busca por texto y se sube al botón.
const WAIT = { timeout: 10_000 };
async function button(text: string | RegExp): Promise<HTMLButtonElement> {
  const nodes = await screen.findAllByText(text, undefined, WAIT);
  const btn = nodes.map((n) => n.closest('button')).find((b): b is HTMLButtonElement => !!b);
  if (!btn) throw new Error(`No hay botón con el texto ${String(text)}`);
  return btn;
}

function cacheDump(): string {
  const queries = client.getQueryCache().getAll().map((q) => q.state.data);
  const mutations = client.getMutationCache().getAll().map((m) => m.state.data);
  return JSON.stringify({ queries, mutations });
}

// AntD en jsdom es lento (CSS-in-JS): más margen que los 5 s por defecto.
describe('Usuarios: contraseña temporal', { timeout: 30_000 }, () => {
  beforeEach(() => {
    calls = [];
    invalidateStepUp();
    // AntD necesita matchMedia y ResizeObserver, que jsdom no trae.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // jsdom no implementa getComputedStyle con pseudo-elemento (AntD mide la barra de scroll).
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elt: Element) => computed(elt));
    writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const adapter = async (config: InternalAxiosRequestConfig) => {
      const method = (config.method ?? 'get').toUpperCase();
      const url = config.url ?? '';
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : undefined;
      const stepUp = AxiosHeaders.from(config.headers).get('X-Step-Up');
      calls.push({ method, url, body, stepUp: typeof stepUp === 'string' ? stepUp : undefined });
      if (method === 'GET' && url === '/admin/users') {
        return respond(config, 200, { items: [dj], page: 1, pageSize: 20, total: 1 } satisfies Paginated<AdminUserDto>);
      }
      if (method === 'POST' && url === '/admin/users') {
        return respond(config, 201, tempPassword((body as { username: string }).username));
      }
      if (method === 'POST' && url === '/auth/step-up') {
        return respond(config, 200, { stepUpToken: 'su.token', expiresIn: 300 });
      }
      if (method === 'POST' && url === `/admin/users/${dj.id}/reset-password`) {
        return stepUp === 'su.token'
          ? respond(config, 200, tempPassword(dj.username))
          : respond(config, 403, { statusCode: 403, code: 'STEP_UP_REQUIRED', message: 'x' });
      }
      return respond(config, 404, { statusCode: 404, code: 'NOT_FOUND', message: 'x' });
    };
    http.defaults.adapter = adapter;
    rawHttp.defaults.adapter = adapter;
    applySession({ accessToken: 'tok', expiresIn: 900, user: admin });
  });

  afterEach(() => {
    cleanup();
    clearLocalSession();
    vi.unstubAllGlobals();
  });

  it('al crear un usuario muestra la contraseña una sola vez, con copiar y aviso, y no la deja en caché', async () => {
    renderPage();
    expect(await screen.findByText('dj.uno', undefined, WAIT)).toBeTruthy();

    fireEvent.click(await button('Crear usuario'));
    fireEvent.change(await screen.findByLabelText('Usuario', undefined, WAIT), { target: { value: '  DJ.Nuevo ' } });
    fireEvent.click(await button('Crear'));

    const code = await screen.findByTestId('temp-password', undefined, WAIT);
    expect(code.textContent).toBe(TEMP);
    expect(screen.getByText('No se volverá a mostrar')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.url === '/admin/users')?.body).toEqual({ username: 'dj.nuevo', email: null });

    fireEvent.click(await button('Copiar contraseña'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEMP), WAIT);

    // Ni en las consultas ni en las mutaciones de TanStack Query.
    expect(cacheDump()).not.toContain(TEMP);

    fireEvent.click(await button('Ya la copié'));
    await waitFor(() => expect(screen.queryByText(TEMP)).toBeNull(), WAIT);
    expect(document.body.textContent).not.toContain(TEMP);

    // La lista se recarga y la contraseña no vuelve a aparecer por ningún lado.
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.url === '/admin/users').length).toBeGreaterThan(1), WAIT);
    expect(document.body.textContent).not.toContain(TEMP);
    expect(cacheDump()).not.toContain(TEMP);
  });

  it('restablecer contraseña pide step-up y manda X-Step-Up', async () => {
    renderPage();
    fireEvent.click(await button('Acciones'));
    fireEvent.click(await screen.findByText('Restablecer contraseña', undefined, WAIT));
    fireEvent.click(await button('Restablecer'));

    fireEvent.change(await screen.findByLabelText('Contraseña', undefined, WAIT), { target: { value: 'clave-del-admin-123' } });
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '123456' } });
    fireEvent.click(await button('Confirmar'));

    expect((await screen.findByTestId('temp-password', undefined, WAIT)).textContent).toBe(TEMP);
    expect(calls.find((c) => c.url === '/auth/step-up')?.body).toEqual({ password: 'clave-del-admin-123', code: '123456' });
    const reset = calls.find((c) => c.url === `/admin/users/${dj.id}/reset-password`);
    expect(reset?.stepUp).toBe('su.token');

    fireEvent.click(await button('Ya la copié'));
    await waitFor(() => expect(screen.queryByText(TEMP)).toBeNull(), WAIT);
  });
});
