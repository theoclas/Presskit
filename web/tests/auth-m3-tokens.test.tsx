import type { MeDto } from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { Outlet, RouterProvider, createBrowserRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ForgotPasswordPage, FORGOT_GENERIC_MESSAGE } from '../src/auth/ForgotPasswordPage';
import { RegisterPage } from '../src/auth/RegisterPage';
import { ResetPasswordPage } from '../src/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../src/auth/VerifyEmailPage';
import { readHashToken } from '../src/auth/linkToken';
import { applySession, clearLocalSession, getSessionUser, http, rawHttp } from '../src/lib/http';
import { routes } from '../src/routes';

const TOKEN = 'Q2hpY2EtZmVyc3VhLXRva2VuLWRlLXBydWViYS0xMjM';

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) return Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response));
  return Promise.resolve(response);
}

function networkError(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {}));
}

type Handler = (url: string, body: Record<string, unknown>) => { status: number; data: unknown } | 'network';
let handler: Handler;
const calls: { url: string; body: Record<string, unknown> }[] = [];

/** Con el router del navegador (jsdom): la página lee y limpia window.location de verdad. */
function renderAtUrl(url: string, path: string, element: ReactNode) {
  window.history.replaceState(null, '', url);
  const router = createBrowserRouter([
    {
      element: (
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      ),
      children: [
        { path, element },
        { path: '*', element: <p data-testid="elsewhere">otra página</p> },
      ],
    },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const referrerMeta = () => document.head.querySelector('meta[name="referrer"]');

beforeEach(() => {
  clearLocalSession();
  localStorage.clear();
  calls.length = 0;
  handler = () => ({ status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'x' } });
  const adapter = async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    const body = typeof config.data === 'string' ? (JSON.parse(config.data) as Record<string, unknown>) : {};
    calls.push({ url, body });
    const res = handler(url, body);
    return res === 'network' ? networkError(config) : respond(config, res.status, res.data);
  };
  http.defaults.adapter = adapter;
  rawHttp.defaults.adapter = adapter;
});

afterEach(() => {
  cleanup();
  clearLocalSession();
  window.history.replaceState(null, '', '/');
});

describe('readHashToken', () => {
  it('lee solo `t` con forma de token', () => {
    expect(readHashToken(`#t=${TOKEN}`)).toBe(TOKEN);
    expect(readHashToken(`#x=1&t=${TOKEN}`)).toBe(TOKEN);
    expect(readHashToken('')).toBeNull();
    expect(readHashToken('#t=')).toBeNull();
    expect(readHashToken('#t=corto')).toBeNull();
    expect(readHashToken('#t=<script>alert(1)</script>xxxxxxxxxxxx')).toBeNull();
    expect(readHashToken(`#token=${TOKEN}`)).toBeNull();
  });
});

describe('/verificar-correo', () => {
  it('lee #t=, lo quita de la URL al instante y pone no-referrer mientras está montada', async () => {
    const view = renderAtUrl(`/verificar-correo#t=${TOKEN}`, '/verificar-correo', <VerifyEmailPage />);
    await screen.findByRole('button', { name: 'Confirmar mi correo' });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/verificar-correo');
    expect(window.location.href).not.toContain(TOKEN);
    expect(referrerMeta()?.getAttribute('content')).toBe('no-referrer');
    view.unmount();
    expect(referrerMeta()).toBeNull();
  });

  it('exige un clic explícito: no llama al api hasta tocar el botón', async () => {
    handler = (url) => (url === '/auth/verify-email' ? { status: 204, data: '' } : { status: 404, data: {} });
    renderAtUrl(`/verificar-correo#t=${TOKEN}`, '/verificar-correo', <VerifyEmailPage />);
    const button = await screen.findByRole('button', { name: 'Confirmar mi correo' });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(0);

    fireEvent.click(button);
    expect(await screen.findByText('¡Listo! Tu correo quedó confirmado.')).toBeTruthy();
    expect(calls).toEqual([{ url: '/auth/verify-email', body: { token: TOKEN } }]);
    expect(screen.getByRole('link', { name: 'Ir a mi panel' }).getAttribute('href')).toBe('/panel');
  });

  it('con sesión abierta, al confirmar recarga el usuario (emailVerified)', async () => {
    const user: MeDto = {
      id: 'cuser0000000000000000000001',
      username: 'dj.nuevo',
      email: 'dj@example.com',
      emailVerified: false,
      role: 'USER',
      mustChangePassword: false,
      mfaEnabled: false,
      profile: null,
      termsVersion: '2026-09',
    };
    applySession({ accessToken: 'tok', expiresIn: 900, user });
    handler = (url) => {
      if (url === '/auth/verify-email') return { status: 204, data: '' };
      if (url === '/auth/me') return { status: 200, data: { ...user, emailVerified: true } };
      return { status: 404, data: {} };
    };
    renderAtUrl(`/verificar-correo#t=${TOKEN}`, '/verificar-correo', <VerifyEmailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar mi correo' }));
    await waitFor(() => expect(getSessionUser()?.emailVerified).toBe(true));
  });

  it('token inválido, usado o vencido: mensaje y enlace al panel', async () => {
    handler = () => ({ status: 400, data: { statusCode: 400, code: 'TOKEN_INVALID', message: 'x' } });
    renderAtUrl(`/verificar-correo#t=${TOKEN}`, '/verificar-correo', <VerifyEmailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar mi correo' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/no es válido, ya se usó o venció/);
    expect(screen.queryByRole('button', { name: 'Confirmar mi correo' })).toBeNull();
  });

  it('sin token en el enlace: no muestra el botón ni llama al api', async () => {
    renderAtUrl('/verificar-correo', '/verificar-correo', <VerifyEmailPage />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/no es válido/);
    expect(screen.queryByRole('button', { name: 'Confirmar mi correo' })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('un error de red deja reintentar', async () => {
    handler = () => 'network';
    renderAtUrl(`/verificar-correo#t=${TOKEN}`, '/verificar-correo', <VerifyEmailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar mi correo' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos conectarnos/);
    expect(screen.getByRole('button', { name: 'Confirmar mi correo' })).toBeTruthy();
  });
});

describe('/restablecer', () => {
  const fill = (pw: string, confirm = pw) => {
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: pw } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  };

  it('lee #t= y lo quita de la URL; no-referrer mientras está montada', async () => {
    const view = renderAtUrl(`/restablecer#t=${TOKEN}`, '/restablecer', <ResetPasswordPage />);
    await screen.findByLabelText('Contraseña nueva');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(referrerMeta()?.getAttribute('content')).toBe('no-referrer');
    view.unmount();
    expect(referrerMeta()).toBeNull();
  });

  it('aplica la política y la confirmación antes de enviar', async () => {
    renderAtUrl(`/restablecer#t=${TOKEN}`, '/restablecer', <ResetPasswordPage />);
    await screen.findByLabelText('Contraseña nueva');
    fill('corta');
    expect(await screen.findByText('Usa al menos 10 caracteres.')).toBeTruthy();
    fill('una-clave-nueva-larga', 'otra-clave-distinta');
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('guarda con el token y enlaza a /login', async () => {
    handler = (url) => (url === '/auth/reset-password' ? { status: 204, data: '' } : { status: 404, data: {} });
    renderAtUrl(`/restablecer#t=${TOKEN}`, '/restablecer', <ResetPasswordPage />);
    await screen.findByLabelText('Contraseña nueva');
    fill('una-clave-nueva-larga');
    expect(await screen.findByText(/tu contraseña quedó cambiada/)).toBeTruthy();
    expect(calls).toEqual([{ url: '/auth/reset-password', body: { token: TOKEN, newPassword: 'una-clave-nueva-larga' } }]);
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('/login');
  });

  it('enlace vencido: mensaje y enlace a /recuperar', async () => {
    handler = () => ({ status: 400, data: { statusCode: 400, code: 'TOKEN_INVALID', message: 'x' } });
    renderAtUrl(`/restablecer#t=${TOKEN}`, '/restablecer', <ResetPasswordPage />);
    await screen.findByLabelText('Contraseña nueva');
    fill('una-clave-nueva-larga');
    expect((await screen.findByRole('alert')).textContent).toMatch(/no es válido o ya venció/);
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' }).getAttribute('href')).toBe('/recuperar');
  });

  it('la política del api (p. ej. contiene el usuario) marca el campo', async () => {
    handler = () => ({
      status: 400,
      data: { statusCode: 400, code: 'PASSWORD_WEAK', message: 'No puede contener tu nombre de usuario.', details: { newPassword: 'CONTAINS_USERNAME' } },
    });
    renderAtUrl(`/restablecer#t=${TOKEN}`, '/restablecer', <ResetPasswordPage />);
    await screen.findByLabelText('Contraseña nueva');
    fill('una-clave-nueva-larga');
    expect(await screen.findByText('No puede contener tu nombre de usuario.')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña nueva').getAttribute('aria-invalid')).toBe('true');
  });

  it('sin token: directo al mensaje de enlace inválido', async () => {
    renderAtUrl('/restablecer', '/restablecer', <ResetPasswordPage />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/no es válido o ya venció/);
    expect(screen.queryByLabelText('Contraseña nueva')).toBeNull();
  });
});

describe('/recuperar', () => {
  const send = async (identifier: string) => {
    fireEvent.change(await screen.findByLabelText('Usuario o correo'), { target: { value: identifier } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
  };

  it.each([
    ['202', { status: 202, data: '' }],
    ['404', { status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'x' } }],
    ['400', { status: 400, data: { statusCode: 400, code: 'VALIDATION_FAILED', message: 'x' } }],
    ['500', { status: 500, data: { statusCode: 500, code: 'INTERNAL', message: 'x' } }],
  ])('respuesta %s: siempre el mismo mensaje genérico', async (_label, res) => {
    handler = () => res;
    renderAtUrl('/recuperar', '/recuperar', <ForgotPasswordPage />);
    await send('  dj.nuevo  ');
    expect((await screen.findByRole('status')).textContent).toBe(FORGOT_GENERIC_MESSAGE);
    expect(calls).toEqual([{ url: '/auth/forgot-password', body: { identifier: 'dj.nuevo' } }]);
  });

  it('pide el dato si está vacío (sin llamar al api)', async () => {
    renderAtUrl('/recuperar', '/recuperar', <ForgotPasswordPage />);
    await send('   ');
    expect(await screen.findByText('Escribe tu usuario o tu correo.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('sin conexión lo dice (no se envió nada)', async () => {
    handler = () => 'network';
    renderAtUrl('/recuperar', '/recuperar', <ForgotPasswordPage />);
    await send('dj@example.com');
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos conectarnos/);
    expect(screen.queryByText(FORGOT_GENERIC_MESSAGE)).toBeNull();
  });
});

describe('rutas de M3', () => {
  const authRoot = routes[0]?.children?.find((r) => r.id === 'auth-root');
  const child = (path: string): RouteObject | undefined => authRoot?.children?.find((r) => r.path === path);

  it.each([
    ['registro', RegisterPage],
    ['recuperar', ForgotPasswordPage],
    ['restablecer', ResetPasswordPage],
    ['verificar-correo', VerifyEmailPage],
  ] as const)('/%s va dentro de AuthRoot con su página', async (path, Page) => {
    const route = child(path);
    expect(route?.lazy).toBeTypeOf('function');
    const loaded = await (route?.lazy as () => Promise<{ Component: unknown }>)();
    expect(loaded.Component).toBe(Page);
  });

  it('/panel/* es el panel del DJ (PanelApp), diferido y dentro de AuthRoot', async () => {
    const route = child('panel/*');
    expect(route?.lazy).toBeTypeOf('function');
    const loaded = await (route?.lazy as () => Promise<{ Component: unknown }>)();
    const { PanelApp } = await import('../src/panel/PanelApp');
    expect(loaded.Component).toBe(PanelApp);
    // Carga el panel completo con antd: con la suite entera en paralelo puede pasar de 20 s.
  }, 60_000);
});
