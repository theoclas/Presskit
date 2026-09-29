import type { LoginResultDto, MeDto, SessionDto } from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { LoginPage } from '../src/auth/LoginPage';
import { destinationAfterLogin } from '../src/auth/destinations';
import { clearLocalSession, http, rawHttp } from '../src/lib/http';

function me(over: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u_000000000000000000000001',
    username: 'fersua',
    email: null,
    emailVerified: false,
    role: 'ADMIN',
    mustChangePassword: false,
    mfaEnabled: false,
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

type Handler = (url: string, body: Record<string, unknown>) => { status: number; data: unknown };
let handler: Handler;
const calls: { url: string; body: Record<string, unknown> }[] = [];

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderLogin(entry: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [
          { path: '/login', element: <LoginPage /> },
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

async function submitCredentials(username = 'fersua', password = 'una-clave-larga-123') {
  fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    clearLocalSession();
    localStorage.clear();
    calls.length = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      const url = config.url ?? '';
      const body = typeof config.data === 'string' ? (JSON.parse(config.data) as Record<string, unknown>) : {};
      calls.push({ url, body });
      const res = handler(url, body);
      return respond(config, res.status, res.data);
    };
    http.defaults.adapter = adapter;
    rawHttp.defaults.adapter = adapter;
  });

  afterEach(() => {
    cleanup();
    clearLocalSession();
  });

  const loginAs = (user: MeDto): Handler => (url) =>
    url === '/auth/login'
      ? { status: 200, data: { accessToken: 'tok', expiresIn: 900, user } satisfies SessionDto }
      : { status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'x' } };

  it.each([
    ['/login?next=%2Fadmin%2Fusuarios', '/admin/usuarios'],
    ['/login?next=https%3A%2F%2Fevil.example%2Fadmin', '/admin'],
    ['/login?next=%2F%2Fevil.example', '/admin'],
    ['/login?next=%2Fadmin%2F..%5C..%5Cx', '/admin'],
    ['/login?next=javascript%3Aalert(1)', '/admin'],
    ['/login', '/admin'],
  ])('ADMIN: %s -> %s (next solo si pasa isSafeNextPath)', async (entry, expected) => {
    handler = loginAs(me());
    renderLogin(entry);
    await submitCredentials();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(expected));
    expect(calls[0]).toEqual({ url: '/auth/login', body: { username: 'fersua', password: 'una-clave-larga-123' } });
  });

  it('un DJ va a /panel aunque next apunte al admin', async () => {
    handler = loginAs(me({ role: 'USER', username: 'dj.uno' }));
    renderLogin('/login?next=%2Fadmin%2Fusuarios');
    await submitCredentials('dj.uno');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/panel'));
  });

  it('con contraseña temporal va primero a /cambiar-clave (conservando next)', async () => {
    handler = loginAs(me({ mustChangePassword: true }));
    renderLogin('/login?next=%2Fadmin%2Fgeneros');
    await submitCredentials();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/cambiar-clave?next=%2Fadmin%2Fgeneros'));
  });

  it('muestra un error genérico y borra la contraseña si falla', async () => {
    handler = () => ({ status: 401, data: { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'x' } });
    renderLogin('/login');
    await submitCredentials();
    expect((await screen.findByRole('alert')).textContent).toBe('Usuario o contraseña incorrectos');
    expect((screen.getByLabelText('Contraseña') as HTMLInputElement).value).toBe('');
  });

  it('el campo de contraseña tiene autocomplete y botón para mostrarla', async () => {
    handler = loginAs(me());
    renderLogin('/login');
    const user = (await screen.findByLabelText('Usuario')) as HTMLInputElement;
    const pw = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(user.autocomplete).toBe('username');
    expect(pw.autocomplete).toBe('current-password');
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(pw.type).toBe('text');
  });

  it('paso de 2FA: código de 6 dígitos (numérico, one-time-code) o código de recuperación', async () => {
    handler = (url, body) => {
      if (url === '/auth/login') return { status: 200, data: { mfaRequired: true, mfaToken: 'mfa.jwt' } satisfies LoginResultDto };
      if (url === '/auth/mfa' && body.code === 'ABCD-EFGH') {
        return { status: 200, data: { accessToken: 'tok', expiresIn: 900, user: me({ mfaEnabled: true }) } satisfies SessionDto };
      }
      return { status: 401, data: { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'x' } };
    };
    renderLogin('/login?next=%2Fadmin%2Fauditoria');
    await submitCredentials();

    const code = (await screen.findByLabelText('Código de 6 dígitos')) as HTMLInputElement;
    expect(code.inputMode).toBe('numeric');
    expect(code.autocomplete).toBe('one-time-code');
    expect(code.maxLength).toBe(6);

    fireEvent.change(code, { target: { value: '12a3456' } });
    expect(code.value).toBe('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/código no es correcto/);
    expect(calls.at(-1)).toEqual({ url: '/auth/mfa', body: { mfaToken: 'mfa.jwt', code: '123456' } });

    fireEvent.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    const recovery = screen.getByLabelText('Código de recuperación') as HTMLInputElement;
    fireEvent.change(recovery, { target: { value: 'abcd efgh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/auditoria'));
    expect(calls.at(-1)).toEqual({ url: '/auth/mfa', body: { mfaToken: 'mfa.jwt', code: 'ABCD-EFGH' } });
  });
});

describe('destinationAfterLogin', () => {
  it('ignora next inseguros y respeta el área de cada rol', () => {
    expect(destinationAfterLogin(me(), '/admin/djs/abc')).toBe('/admin/djs/abc');
    expect(destinationAfterLogin(me(), '/administrador')).toBe('/admin');
    expect(destinationAfterLogin(me(), '/panel/fotos')).toBe('/admin');
    expect(destinationAfterLogin(me({ role: 'USER' }), '/panel/fotos')).toBe('/panel/fotos');
    expect(destinationAfterLogin(me({ role: 'USER' }), 'https://evil.example')).toBe('/panel');
    expect(destinationAfterLogin(me({ mustChangePassword: true }), '//evil.example')).toBe('/cambiar-clave');
  });
});
