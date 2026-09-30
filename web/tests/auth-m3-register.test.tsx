import { LEGAL_DOCS, REGISTER_CONSENTS, type MeDto, type SessionDto } from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { LoginPage } from '../src/auth/LoginPage';
import { RegisterPage } from '../src/auth/RegisterPage';
import { EMPTY_REGISTER_VALUES, registerFailure, validateRegister, type RegisterValues } from '../src/auth/registerForm';
import { applySession, clearLocalSession, getSessionUser, http, rawHttp } from '../src/lib/http';

const GOOD_PASSWORD = 'luces-del-club-2026';

function me(over: Partial<MeDto> = {}): MeDto {
  return {
    id: 'cuser0000000000000000000001',
    username: 'dj.nuevo',
    email: 'dj@example.com',
    emailVerified: false,
    role: 'USER',
    mustChangePassword: false,
    mfaEnabled: false,
    profile: null,
    termsVersion: LEGAL_DOCS.artistTerms.version,
    termsOutdated: false,
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

/** GET /api/auth/registration va con fetch (sin axios): se simula aquí. */
function stubRegistration(open: boolean | 'error') {
  const fn = vi.fn(async () =>
    open === 'error'
      ? new Response('{}', { status: 500 })
      : new Response(JSON.stringify({ open }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderAt(entry: string, page: { path: string; element: ReactNode }) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [page, { path: '*', element: <Where /> }],
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

const renderRegister = () => renderAt('/registro', { path: '/registro', element: <RegisterPage /> });

async function fillRegister(over: Partial<{ username: string; email: string; password: string; confirm: string }> = {}) {
  const v = { username: 'DJ.Nuevo', email: ' DJ@Example.com ', password: GOOD_PASSWORD, confirm: undefined as string | undefined, ...over };
  fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: v.username } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: v.email } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: v.password } });
  fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: v.confirm ?? v.password } });
}

const consentBoxes = () => ({
  terms: screen.getByRole('checkbox', { name: /Términos para Artistas/ }) as HTMLInputElement,
  data: screen.getByRole('checkbox', { name: /Política de Tratamiento de Datos Personales/ }) as HTMLInputElement,
  age: screen.getByRole('checkbox', { name: /mayor de 18 años/ }) as HTMLInputElement,
});

function checkAll() {
  const c = consentBoxes();
  fireEvent.click(c.terms);
  fireEvent.click(c.data);
  fireEvent.click(c.age);
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

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
    return respond(config, res.status, res.data);
  };
  http.defaults.adapter = adapter;
  rawHttp.defaults.adapter = adapter;
});

afterEach(() => {
  cleanup();
  clearLocalSession();
  vi.unstubAllGlobals();
});

describe('validateRegister', () => {
  const valid: RegisterValues = {
    username: 'dj.nuevo',
    email: 'dj@example.com',
    password: GOOD_PASSWORD,
    confirm: GOOD_PASSWORD,
    acceptTerms: true,
    acceptPrivacy: true,
    confirmAge: true,
  };

  it('acepta un formulario completo', () => {
    expect(validateRegister(valid)).toEqual({});
  });

  it('las tres casillas son obligatorias, cada una por separado', () => {
    expect(Object.keys(validateRegister({ ...valid, acceptTerms: false }))).toEqual(['acceptTerms']);
    expect(Object.keys(validateRegister({ ...valid, acceptPrivacy: false }))).toEqual(['acceptPrivacy']);
    expect(Object.keys(validateRegister({ ...valid, confirmAge: false }))).toEqual(['confirmAge']);
    const empty = validateRegister(EMPTY_REGISTER_VALUES);
    expect(empty.acceptTerms).toMatch(/Términos para Artistas/);
    expect(empty.acceptPrivacy).toMatch(/tratamiento de tus datos/);
    expect(empty.confirmAge).toMatch(/mayor de 18/);
  });

  it('aplica la política de contraseñas de shared (con el usuario)', () => {
    expect(validateRegister({ ...valid, password: 'corta', confirm: 'corta' }).password).toBe('Usa al menos 10 caracteres.');
    expect(validateRegister({ ...valid, password: 'xx-dj.nuevo-xx', confirm: 'xx-dj.nuevo-xx' }).password).toBe(
      'No puede contener tu nombre de usuario.',
    );
    expect(validateRegister({ ...valid, password: 'password123', confirm: 'password123' }).password).toMatch(/muy común/);
    expect(validateRegister({ ...valid, confirm: 'otra-cosa-distinta' }).confirm).toBe('Las contraseñas no coinciden.');
  });

  it('usuario y correo con las reglas de shared', () => {
    expect(validateRegister({ ...valid, username: 'ab' }).username).toMatch(/de 3 a 24/);
    expect(validateRegister({ ...valid, username: 'dj..uno' }).username).toMatch(/de 3 a 24/);
    expect(validateRegister({ ...valid, username: 'admin' }).username).toMatch(/reservado/);
    expect(validateRegister({ ...valid, email: 'no-es-correo' }).email).toMatch(/no es válido/);
  });

  it('traduce los errores del api', () => {
    const err = (status: number, code: string) =>
      new AxiosError('x', 'ERR', undefined, {}, {
        status,
        data: { statusCode: status, code, message: 'm' },
        statusText: '',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      });
    expect(registerFailure(err(409, 'USERNAME_TAKEN'))).toMatchObject({ kind: 'field', field: 'username' });
    expect(registerFailure(err(409, 'EMAIL_TAKEN'))).toMatchObject({ kind: 'field', field: 'email', emailTaken: true });
    expect(registerFailure(err(403, 'REGISTRATION_CLOSED'))).toEqual({ kind: 'closed' });
    expect(registerFailure(err(429, 'RATE_LIMITED'))).toMatchObject({ kind: 'alert', message: expect.stringMatching(/demasiados intentos/) });
    expect(registerFailure(err(400, 'PASSWORD_WEAK'))).toMatchObject({ kind: 'field', field: 'password', message: 'm' });
  });
});

describe('/registro', () => {
  it('muestra el aviso si el registro está cerrado (y no pinta el formulario)', async () => {
    stubRegistration(false);
    renderRegister();
    expect(await screen.findByText('El registro está cerrado por ahora.')).toBeTruthy();
    expect(screen.queryByLabelText('Usuario')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('/login');
  });

  it('consulta el estado del registro antes de mostrar el formulario', async () => {
    const fetchFn = stubRegistration(true);
    renderRegister();
    await screen.findByLabelText('Usuario');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toBe('/api/auth/registration');
  });

  it('casillas separadas, sin marcar, con enlaces a los documentos en otra pestaña; honeypot oculto', async () => {
    stubRegistration(true);
    renderRegister();
    await screen.findByLabelText('Usuario');
    const c = consentBoxes();
    for (const box of [c.terms, c.data, c.age]) {
      expect(box.checked).toBe(false);
      expect(box.required).toBe(true);
    }
    expect(c.age.closest('label')?.textContent).toContain(REGISTER_CONSENTS.age);
    const terms = screen.getByRole('link', { name: LEGAL_DOCS.artistTerms.title });
    expect(terms.getAttribute('href')).toBe('/terminos-artistas');
    expect(terms.getAttribute('target')).toBe('_blank');
    const privacy = screen.getByRole('link', { name: LEGAL_DOCS.privacy.title });
    expect(privacy.getAttribute('href')).toBe('/privacidad');
    expect(privacy.getAttribute('target')).toBe('_blank');

    const hp = document.querySelector('input[name="hp_x7"]') as HTMLInputElement;
    expect(hp.tabIndex).toBe(-1);
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('no envía nada sin las tres casillas y enfoca la primera que falta', async () => {
    stubRegistration(true);
    renderRegister();
    await fillRegister();
    fireEvent.click(consentBoxes().data);
    submit();
    expect(await screen.findByText('Debes aceptar los Términos para Artistas para crear tu cuenta.')).toBeTruthy();
    expect(screen.getByText('Debes ser mayor de 18 años para crear una cuenta.')).toBeTruthy();
    expect(screen.queryByText('Debes autorizar el tratamiento de tus datos para crear tu cuenta.')).toBeNull();
    expect(document.activeElement).toBe(consentBoxes().terms);
    expect(calls).toHaveLength(0);
  });

  it('pistas de la contraseña en vivo con el usuario escrito, y error al enviar', async () => {
    stubRegistration(true);
    renderRegister();
    await fillRegister({ username: 'dj.nuevo', password: 'mi-dj.nuevo' });
    const rules = screen.getByRole('list', { name: 'Requisitos de la contraseña' });
    const state = () => [...rules.querySelectorAll('li')].map((li) => li.getAttribute('data-ok'));
    expect(state()).toEqual(['true', 'false', 'true']);
    checkAll();
    submit();
    expect(await screen.findByText('No puede contener tu nombre de usuario.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Contraseña'));
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: GOOD_PASSWORD } });
    expect(state()).toEqual(['true', 'true', 'true']);
    expect(calls).toHaveLength(0);
  });

  it('el usuario se escribe en minúscula', async () => {
    stubRegistration(true);
    renderRegister();
    const input = (await screen.findByLabelText('Usuario')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DJ.Nuevo' } });
    expect(input.value).toBe('dj.nuevo');
    expect(input.autocomplete).toBe('username');
    expect((screen.getByLabelText('Contraseña') as HTMLInputElement).autocomplete).toBe('new-password');
  });

  it('crea la cuenta, deja la sesión iniciada y va a /panel', async () => {
    stubRegistration(true);
    handler = (url) =>
      url === '/auth/register'
        ? { status: 201, data: { accessToken: 'tok', expiresIn: 900, user: me() } satisfies SessionDto }
        : { status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'x' } };
    renderRegister();
    await fillRegister();
    checkAll();
    submit();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/panel'));
    expect(calls).toEqual([
      {
        url: '/auth/register',
        body: {
          username: 'dj.nuevo',
          email: 'dj@example.com',
          password: GOOD_PASSWORD,
          acceptTerms: true,
          acceptPrivacy: true,
          confirmAge: true,
        },
      },
    ]);
    expect(getSessionUser()?.username).toBe('dj.nuevo');
  });

  it('honeypot lleno: lo manda y, sin sesión en la respuesta, no entra al panel', async () => {
    stubRegistration(true);
    handler = () => ({ status: 201, data: {} });
    renderRegister();
    await fillRegister();
    fireEvent.change(document.querySelector('input[name="hp_x7"]') as HTMLInputElement, { target: { value: 'bot' } });
    checkAll();
    submit();
    expect((await screen.findByRole('status')).textContent).toMatch(/Recibimos tu registro/);
    expect(calls[0]?.body.hp_x7).toBe('bot');
    expect(getSessionUser()).toBeNull();
  });

  it('409 USERNAME_TAKEN / EMAIL_TAKEN marcan su campo', async () => {
    stubRegistration(true);
    let code = 'USERNAME_TAKEN';
    handler = () => ({ status: 409, data: { statusCode: 409, code, message: 'x' } });
    renderRegister();
    await fillRegister();
    checkAll();
    submit();
    expect(await screen.findByText('Ese nombre de usuario ya está en uso. Prueba con otro.')).toBeTruthy();
    expect(screen.getByLabelText('Usuario').getAttribute('aria-invalid')).toBe('true');

    code = 'EMAIL_TAKEN';
    submit();
    expect(await screen.findByText(/Ya existe una cuenta con ese correo/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Recuperar mi contraseña' }).getAttribute('href')).toBe('/recuperar');
  });

  it('403 REGISTRATION_CLOSED muestra el aviso de cerrado; 429 un aviso de espera', async () => {
    stubRegistration(true);
    let status = 429;
    handler = () => ({
      status,
      data: { statusCode: status, code: status === 429 ? 'RATE_LIMITED' : 'REGISTRATION_CLOSED', message: 'x' },
    });
    renderRegister();
    await fillRegister();
    checkAll();
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/demasiados intentos/);

    status = 403;
    submit();
    expect(await screen.findByText('El registro está cerrado por ahora.')).toBeTruthy();
    expect(screen.queryByLabelText('Usuario')).toBeNull();
  });

  it('con sesión abierta no muestra el formulario: va a su área', async () => {
    stubRegistration(true);
    applySession({ accessToken: 'tok', expiresIn: 900, user: me() });
    renderRegister();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/panel'));
  });
});

describe('/login (enlaces de M3)', () => {
  const renderLogin = () => renderAt('/login', { path: '/login', element: <LoginPage /> });

  it('enlaza a /recuperar siempre y a /registro solo si está abierto', async () => {
    stubRegistration(true);
    renderLogin();
    expect((await screen.findByRole('link', { name: 'Crea tu cuenta' })).getAttribute('href')).toBe('/registro');
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).getAttribute('href')).toBe('/recuperar');
  });

  it('sin registro abierto no muestra "Crea tu cuenta"', async () => {
    const fetchFn = stubRegistration(false);
    renderLogin();
    await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' });
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('link', { name: 'Crea tu cuenta' })).toBeNull();
  });
});

describe('AuthProvider.acceptTerms', () => {
  it('manda las dos aceptaciones y actualiza el usuario de la sesión', async () => {
    applySession({ accessToken: 'tok', expiresIn: 900, user: me({ termsOutdated: true, termsVersion: '2025-01' }) });
    handler = (url) =>
      url === '/auth/accept-terms'
        ? { status: 200, data: me() }
        : { status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'x' } };

    function Probe() {
      const { user, acceptTerms } = useAuth();
      return (
        <>
          <p data-testid="outdated">{String(user?.termsOutdated)}</p>
          <button type="button" onClick={() => void acceptTerms()}>
            Aceptar
          </button>
        </>
      );
    }
    renderAt('/panel', { path: '/panel', element: <Probe /> });
    expect(screen.getByTestId('outdated').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(screen.getByTestId('outdated').textContent).toBe('false'));
    expect(calls).toEqual([{ url: '/auth/accept-terms', body: { acceptTerms: true, acceptPrivacy: true } }]);
    expect(getSessionUser()?.termsOutdated).toBe(false);
  });
});
