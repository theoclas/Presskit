import type {
  BookingDetailDto,
  BookingListItemDto,
  EditorProfileDto,
  MeDto,
  Paginated,
  SlugAvailabilityDto,
} from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { applySession, clearLocalSession, http, rawHttp } from '../src/lib/http';
import { PanelApp } from '../src/panel/PanelApp';

// El panel del DJ montado con el api simulado: guardia, términos, onboarding, resumen y bandeja.

const WAIT = { timeout: 10_000 };

function me(over: Partial<MeDto> = {}): MeDto {
  return {
    id: 'cuser00000000000000000001',
    username: 'dj.ana',
    email: 'ana@example.com',
    emailVerified: true,
    role: 'USER',
    mustChangePassword: false,
    mfaEnabled: false,
    profile: null,
    termsVersion: '2026-09',
    termsOutdated: false,
    ...over,
  };
}

const usage = { assets: 0, bytes: 0, maxAssets: 20, maxBytes: 25 * 1024 * 1024 };

function profile(over: Partial<EditorProfileDto> = {}): EditorProfileDto {
  return {
    id: 'cprof00000000000000000001',
    slug: 'dj-ana',
    status: 'DRAFT',
    statusReason: null,
    displayName: 'DJ Ana',
    tagline: null,
    seoDescription: null,
    city: null,
    whatsappNumber: null,
    publicEmail: null,
    publicPhone: null,
    palette: 'SUNSET',
    texts: {},
    bookingForm: [],
    show: { gallery: true, rider: true, events: true, openDateRow: true, form: true },
    formOpenWhatsapp: false,
    notifyByEmail: true,
    heroImage: null,
    cardImage: null,
    genres: [],
    socials: [],
    members: [],
    gallery: [],
    riderItems: [],
    featured: false,
    featuredRank: 0,
    owner: { id: 'cuser00000000000000000001', username: 'dj.ana', status: 'ACTIVE' },
    hasLegalInfo: false,
    publishMissing: ['heroImage', 'members', 'legalInfo'],
    usage,
    submittedAt: null,
    approvedAt: null,
    updatedAt: '2026-09-29T12:00:00.000Z',
    ...over,
  };
}

const booking: BookingListItemDto = {
  id: 'cbook00000000000000000001',
  profile: { id: 'cprof00000000000000000001', slug: 'dj-ana', displayName: 'DJ Ana' },
  contactName: 'Laura Gómez',
  contactEmail: 'laura@example.com',
  contactPhone: '+57 (300) 123-4567',
  eventDate: '2026-11-14',
  status: 'NEW',
  createdAt: '2026-09-28T20:10:00.000Z',
};

const bookingDetail: BookingDetailDto = {
  ...booking,
  fields: [
    { key: 'city', label: 'Ciudad / Lugar evento', value: 'Medellín' },
    { key: 'message', label: 'Detalles del evento', value: 'Boda\n<b>no es html</b>' },
  ],
  consentAt: booking.createdAt,
  consentVersion: '2026-09',
  readAt: null,
};

const page = <T,>(items: T[]): Paginated<T> => ({ items, page: 1, pageSize: 20, total: items.length });

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) return Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response));
  return Promise.resolve(response);
}

interface Call {
  method: string;
  url: string;
  params: Record<string, unknown> | undefined;
  body: unknown;
}

type Handler = (c: Call, config: InternalAxiosRequestConfig) => Promise<AxiosResponse> | null;

let calls: Call[];
let handler: Handler;
let antdWarnings: string[];

function install(h: Handler) {
  handler = h;
}

function fail(config: InternalAxiosRequestConfig, status: number, code: string, details?: Record<string, string>) {
  return respond(config, status, { statusCode: status, code, message: 'x', ...(details ? { details } : {}) });
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderPanel(entry = '/panel') {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
            <Where />
          </AuthProvider>
        ),
        children: [
          { path: '/panel/*', element: <PanelApp /> },
          { path: '/admin/*', element: <p>Zona del admin</p> },
          { path: '*', element: null },
        ],
      },
    ],
    { initialEntries: [entry] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

const where = () => screen.getByTestId('where').textContent;

describe('panel del DJ', { timeout: 40_000 }, () => {
  beforeEach(() => {
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
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elt: Element) => computed(elt));
    antdWarnings = [];
    const collect = (...args: unknown[]) => {
      const text = args.map(String).join(' ');
      if (text.includes('[antd')) antdWarnings.push(text);
    };
    vi.spyOn(console, 'error').mockImplementation(collect);
    vi.spyOn(console, 'warn').mockImplementation(collect);
    calls = [];
    handler = () => null;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      const call: Call = {
        method: (config.method ?? 'get').toUpperCase(),
        url: config.url ?? '',
        params: config.params as Record<string, unknown> | undefined,
        body: typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data,
      };
      calls.push(call);
      const res = handler(call, config);
      if (res) return res;
      return fail(config, 404, 'NOT_FOUND');
    };
    http.defaults.adapter = adapter;
    rawHttp.defaults.adapter = adapter;
  });

  afterEach(async () => {
    // Ninguna prop obsoleta de AntD 6 (aviso "[antd: ...] ... is deprecated").
    expect(antdWarnings).toEqual([]);
    cleanup();
    clearLocalSession();
    vi.unstubAllGlobals();
    await new Promise((r) => setTimeout(r, 30));
  });

  it('el admin que entra a /panel va a /admin', async () => {
    applySession({ accessToken: 'tok', expiresIn: 900, user: me({ role: 'ADMIN', mfaEnabled: true }) });
    renderPanel('/panel');
    expect(await screen.findByText('Zona del admin', undefined, WAIT)).toBeTruthy();
    expect(calls.some((c) => c.url.startsWith('/me/'))).toBe(false);
  });

  it('con términos desactualizados muestra la re-aceptación y no carga el perfil hasta aceptar', async () => {
    let accepted = false;
    applySession({ accessToken: 'tok', expiresIn: 900, user: me({ termsOutdated: true, termsVersion: '2025-01' }) });
    install((c, config) => {
      if (c.method === 'POST' && c.url === '/auth/accept-terms') {
        accepted = true;
        return respond(config, 200, me({ termsOutdated: false }));
      }
      if (c.method === 'GET' && c.url === '/me/profile') return accepted ? respond(config, 200, profile()) : fail(config, 403, 'TERMS_ACCEPTANCE_REQUIRED');
      if (c.method === 'GET' && c.url === '/me/profile/bookings/unread-count') return respond(config, 200, { count: 0 });
      return null;
    });
    renderPanel('/panel');
    expect(await screen.findByText('Actualizamos nuestros documentos legales', undefined, WAIT)).toBeTruthy();
    expect(calls.some((c) => c.url === '/me/profile')).toBe(false);
    const accept = screen.getByRole('button', { name: /Aceptar y continuar/ });
    expect(accept.hasAttribute('disabled')).toBe(true);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    // Enlaces a los documentos vigentes, en otra pestaña.
    expect(screen.getByRole('link', { name: 'Términos para Artistas' }).getAttribute('href')).toBe('/terminos-artistas');
    expect(screen.getByRole('link', { name: 'Política de Tratamiento de Datos Personales' }).getAttribute('href')).toBe('/privacidad');
    fireEvent.click(boxes[0]!);
    expect(accept.hasAttribute('disabled')).toBe(true);
    fireEvent.click(boxes[1]!);
    await waitFor(() => expect(accept.hasAttribute('disabled')).toBe(false));
    fireEvent.click(accept);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/auth/accept-terms')).toBe(true), WAIT);
    expect(calls.find((c) => c.url === '/auth/accept-terms')?.body).toEqual({ acceptTerms: true, acceptPrivacy: true });
    expect(await screen.findByRole('heading', { name: 'Resumen' }, WAIT)).toBeTruthy();
  });

  it('onboarding: sugiere la dirección, revisa disponibilidad en vivo y crea el perfil', async () => {
    let created: EditorProfileDto | null = null;
    applySession({ accessToken: 'tok', expiresIn: 900, user: me() });
    install((c, config) => {
      if (c.method === 'GET' && c.url === '/me/profile') {
        return created ? respond(config, 200, created) : fail(config, 404, 'NO_PROFILE');
      }
      if (c.method === 'GET' && c.url === '/me/profile/slug-availability') {
        const slug = String(c.params?.slug ?? '');
        const body: SlugAvailabilityDto = slug === 'ocupado' ? { available: false, reason: 'TAKEN' } : { available: true };
        return respond(config, 200, body);
      }
      if (c.method === 'POST' && c.url === '/me/profile') {
        const b = c.body as { displayName: string; slug: string };
        created = profile({ displayName: b.displayName, slug: b.slug });
        return respond(config, 201, created);
      }
      if (c.method === 'GET' && c.url === '/auth/me') return respond(config, 200, me({ profile: { id: 'p', slug: 'x', status: 'DRAFT' } }));
      if (c.method === 'GET' && c.url === '/me/genres') return respond(config, 200, []);
      if (c.method === 'GET' && c.url === '/me/profile/bookings/unread-count') return respond(config, 200, { count: 0 });
      return null;
    });
    renderPanel('/panel');
    expect(await screen.findByRole('heading', { name: 'Crea tu página de DJ' }, WAIT)).toBeTruthy();

    const name = screen.getByLabelText('Nombre artístico') as HTMLInputElement;
    const slug = screen.getByLabelText('Dirección de tu página') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Mike Bran & Macfly' } });
    expect(slug.value).toBe('mike-bran-y-macfly');
    expect(await screen.findByText(/Disponible:/, undefined, WAIT)).toBeTruthy();
    expect(calls.filter((c) => c.url === '/me/profile/slug-availability').map((c) => c.params?.slug)).toEqual(['mike-bran-y-macfly']);

    // Reservada: se avisa sin preguntar al api.
    fireEvent.change(slug, { target: { value: 'admin' } });
    expect(await screen.findByText(/Esa dirección está reservada/, undefined, WAIT)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.some((c) => c.params?.slug === 'admin')).toBe(false);

    // Ocupada: el api dice TAKEN y se proponen alternativas.
    fireEvent.change(slug, { target: { value: 'Ocupado' } });
    expect(slug.value).toBe('ocupado');
    expect(await screen.findByText(/ya la usa otro perfil/, undefined, WAIT)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear mi perfil/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ocupado-dj' }));
    expect(slug.value).toBe('ocupado-dj');
    expect(await screen.findByText(/Disponible:/, undefined, WAIT)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Crear mi perfil/ }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/me/profile')).toBe(true), WAIT);
    expect(calls.find((c) => c.method === 'POST' && c.url === '/me/profile')?.body).toEqual({
      displayName: 'Mike Bran & Macfly',
      slug: 'ocupado-dj',
    });
    await waitFor(() => expect(where()).toBe('/panel/perfil'), WAIT);
  });

  it('resumen: estado rechazado con motivo, checklist y errores de envío con detalle', async () => {
    applySession({ accessToken: 'tok', expiresIn: 900, user: me({ emailVerified: false }) });
    let submitCode: 'PROFILE_INCOMPLETE' | 'EMAIL_NOT_VERIFIED' = 'PROFILE_INCOMPLETE';
    install((c, config) => {
      if (c.method === 'GET' && c.url === '/me/profile') {
        return respond(
          config,
          200,
          profile({ status: 'REJECTED', statusReason: 'La foto de portada <b>está borrosa</b>.', publishMissing: ['heroImage', 'legalInfo'] }),
        );
      }
      if (c.method === 'GET' && c.url === '/me/profile/bookings/unread-count') return respond(config, 200, { count: 2 });
      if (c.method === 'POST' && c.url === '/me/profile/submit') {
        return submitCode === 'PROFILE_INCOMPLETE'
          ? fail(config, 409, 'PROFILE_INCOMPLETE', { heroImage: 'REQUIRED', legalInfo: 'REQUIRED' })
          : fail(config, 403, 'EMAIL_NOT_VERIFIED');
      }
      if (c.method === 'GET' && c.url === '/auth/me') return respond(config, 200, me({ emailVerified: false }));
      return null;
    });
    renderPanel('/panel');
    expect(await screen.findByText('Rechazado: tu perfil necesita cambios', undefined, WAIT)).toBeTruthy();
    // El motivo del admin es texto plano.
    const reason = screen.getByText(/está borrosa/);
    expect(reason.textContent).toBe('La foto de portada <b>está borrosa</b>.');
    expect(document.querySelector('.panel-reason b')).toBeNull();

    const list = screen.getByRole('list', { name: 'Lista para enviar a revisión' });
    const pending = [...list.querySelectorAll('li[data-done="false"]')].map((li) => li.textContent ?? '');
    expect(pending.some((t) => t.includes('Confirma tu correo'))).toBe(true);
    expect(pending.some((t) => t.includes('Sube la foto principal'))).toBe(true);
    expect(pending.some((t) => t.includes('Completa tus datos legales'))).toBe(true);
    expect(pending).toHaveLength(3);

    // Insignia de no leídas en el menú y el aviso de correo sin confirmar.
    expect(await screen.findByText('Tienes 2 solicitudes nuevas.', undefined, WAIT)).toBeTruthy();
    expect(screen.getByText('Confirma tu correo', { selector: '.ant-alert-title' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Enviar a revisión/ }));
    expect(await screen.findByText('Te falta completar esto antes de enviar tu perfil:', undefined, WAIT)).toBeTruthy();
    const problems = document.querySelectorAll('.panel-problem-list li');
    expect([...problems].map((li) => li.textContent)).toEqual([
      'Sube la foto principal (portada)',
      'Completa tus datos legales (art. 53 Ley 1480)',
    ]);

    submitCode = 'EMAIL_NOT_VERIFIED';
    fireEvent.click(screen.getByRole('button', { name: /Enviar a revisión/ }));
    expect(await screen.findByText('Confirma tu correo antes de enviar tu perfil a revisión.', undefined, WAIT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ver mi página/ })).toBeNull();
  });

  it('enviar a revisión con todo completo y luego retirarlo', async () => {
    applySession({ accessToken: 'tok', expiresIn: 900, user: me() });
    let current = profile({ publishMissing: [], hasLegalInfo: true });
    install((c, config) => {
      if (c.method === 'GET' && c.url === '/me/profile') return respond(config, 200, current);
      if (c.method === 'GET' && c.url === '/me/profile/bookings/unread-count') return respond(config, 200, { count: 0 });
      if (c.method === 'POST' && c.url === '/me/profile/submit') {
        current = { ...current, status: 'PENDING_REVIEW', submittedAt: '2026-09-29T13:00:00.000Z' };
        return respond(config, 200, current);
      }
      if (c.method === 'POST' && c.url === '/me/profile/withdraw') {
        current = { ...current, status: 'DRAFT' };
        return respond(config, 200, current);
      }
      if (c.method === 'GET' && c.url === '/auth/me') return respond(config, 200, me());
      return null;
    });
    renderPanel('/panel');
    expect(await screen.findByText('Todo listo: ya puedes enviar tu perfil a revisión.', undefined, WAIT)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Enviar a revisión/ }));
    expect(await screen.findByText(/En revisión: el equipo de Fersua Studio/, undefined, WAIT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enviar a revisión/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Retirar de revisión/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar' }, WAIT));
    expect(await screen.findByText('Borrador: tu página todavía no es pública', undefined, WAIT)).toBeTruthy();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual(['/me/profile/submit', '/me/profile/withdraw']);
  });

  it('reenviar el correo de verificación: 409 ALREADY_VERIFIED refresca la sesión y quita el aviso', async () => {
    applySession({ accessToken: 'tok', expiresIn: 900, user: me({ emailVerified: false }) });
    install((c, config) => {
      if (c.method === 'GET' && c.url === '/me/profile') return respond(config, 200, profile({ status: 'APPROVED', publishMissing: [], hasLegalInfo: true }));
      if (c.method === 'GET' && c.url === '/me/profile/bookings/unread-count') return respond(config, 200, { count: 0 });
      if (c.method === 'POST' && c.url === '/auth/resend-verification') return fail(config, 409, 'ALREADY_VERIFIED');
      if (c.method === 'GET' && c.url === '/auth/me') return respond(config, 200, me({ emailVerified: true }));
      return null;
    });
    renderPanel('/panel');
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar correo' }, WAIT));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reenviar correo' })).toBeNull(), WAIT);
    expect(calls.some((c) => c.method === 'POST' && c.url === '/auth/resend-verification')).toBe(true);
    expect(screen.getByRole('button', { name: /Ver mi página/ })).toBeTruthy();
  });

  it('bandeja: pestañas por estado, detalle con campos y WhatsApp con los dígitos del teléfono', async () => {
    applySession({ accessToken: 'tok', expiresIn: 900, user: me() });
    install((c, config) => {
      if (c.method === 'GET' && c.url === '/me/profile') return respond(config, 200, profile());
      if (c.method === 'GET' && c.url === '/me/profile/bookings/unread-count') return respond(config, 200, { count: 1 });
      if (c.method === 'GET' && c.url === '/me/profile/bookings') {
        return respond(config, 200, c.params?.status === 'NEW' ? page([booking]) : page([]));
      }
      if (c.method === 'GET' && c.url === `/me/profile/bookings/${booking.id}`) return respond(config, 200, bookingDetail);
      if (c.method === 'PATCH' && c.url === `/me/profile/bookings/${booking.id}`) return respond(config, 204, '');
      return null;
    });
    renderPanel('/panel/solicitudes');
    expect(await screen.findByRole('heading', { name: 'Solicitudes' }, WAIT)).toBeTruthy();
    for (const label of ['Nuevas', 'Leídas', 'Archivadas', 'Spam']) expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    fireEvent.click(await screen.findByText('Laura Gómez', undefined, WAIT));
    // Solo status y page: el api no acepta pageSize en la bandeja del dueño.
    const listCall = calls.find((c) => c.url === '/me/profile/bookings');
    expect(listCall?.params).toEqual({ status: 'NEW' });

    expect(await screen.findByText('Datos enviados', undefined, WAIT)).toBeTruthy();
    expect(screen.getByText('Ciudad / Lugar evento')).toBeTruthy();
    expect(screen.getByText('Medellín')).toBeTruthy();
    const value = screen.getByText(/no es html/);
    expect(value.textContent).toBe('Boda\n<b>no es html</b>');
    expect(document.querySelector('.ant-drawer b')).toBeNull();
    expect(screen.getByText(/No los agregues a listas de difusión/)).toBeTruthy();

    const wa = screen.getByText('Responder por WhatsApp').closest('a');
    expect(wa?.getAttribute('href')).toBe('https://wa.me/573001234567');
    expect(wa?.getAttribute('rel')).toContain('noopener');
    const mail = screen.getByText('Responder por correo').closest('a');
    expect(mail?.getAttribute('href')).toMatch(/^mailto:laura@example\.com\?subject=/);

    fireEvent.click(screen.getByRole('tab', { name: 'Archivadas' }));
    await waitFor(() => expect(where()).toBe('/panel/solicitudes?estado=ARCHIVED'), WAIT);
    await waitFor(() => expect(calls.some((c) => c.url === '/me/profile/bookings' && c.params?.status === 'ARCHIVED')).toBe(true), WAIT);
  });
});
