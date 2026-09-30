import type {
  AdminLegalRecordDto,
  AdminLegalRecordListItemDto,
  AdminStatsDto,
  BookingDetailDto,
  BookingListItemDto,
  DiscloseDjResultDto,
  MeDto,
  Paginated,
  TicketDto,
} from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingsPage } from '../src/admin/pages/BookingsPage';
import { LegalRecordsPage } from '../src/admin/pages/LegalRecordsPage';
import { TicketsPage } from '../src/admin/pages/TicketsPage';
import { AuthProvider } from '../src/auth/AuthProvider';
import { StepUpProvider, invalidateStepUp } from '../src/auth/useStepUp';
import { applySession, clearLocalSession, http, rawHttp } from '../src/lib/http';

// M4 en el admin: registros del art. 53 (sin documentos en la lista, detalle auditado),
// entrega de datos del DJ con step-up, filtro de spam y solicitudes ocultas por el DJ.

const admin: MeDto = {
  id: 'cadmin000000000000000000001',
  username: 'fersua',
  email: 'admin@example.com',
  emailVerified: true,
  role: 'ADMIN',
  mustChangePassword: false,
  mfaEnabled: true,
  profile: null,
  termsVersion: null,
};

const DOC = '1234567890';

const recordItem: AdminLegalRecordListItemDto = {
  id: 'clegal0000000000000000001',
  state: 'active',
  profileId: 'cprof00000000000000000001',
  slug: 'macfly-mike-bran',
  displayName: 'Mac Fly & Mike Bran',
  profileStatus: 'APPROVED',
  legalName: 'Miguel Bran',
  closedAt: null,
  purgeAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const record: AdminLegalRecordDto = {
  ...recordItem,
  docType: 'CC',
  docNumber: DOC,
  address: 'Calle 10 # 20-30, Medellín',
  phones: ['3001234567'],
};

const closedItem: AdminLegalRecordListItemDto = {
  ...recordItem,
  id: 'clegal0000000000000000002',
  state: 'closed',
  profileId: null,
  profileStatus: null,
  slug: 'dj-viejo',
  displayName: 'DJ Viejo',
  legalName: 'Pedro Pérez',
  closedAt: '2026-06-01T10:00:00.000Z',
  purgeAt: '2027-06-01T10:00:00.000Z',
};

const TEMPLATE = `Hola Laura:\nEstos son los datos del DJ (art. 53): Miguel Bran, CC ${DOC}.`;

const dataTicket: TicketDto = {
  id: 'cticket000000000000000001',
  type: 'SOLICITUD_DATOS_DJ',
  status: 'OPEN',
  profile: { id: recordItem.profileId!, slug: recordItem.slug!, displayName: recordItem.displayName! },
  profileSlug: recordItem.slug,
  name: 'Laura Gómez',
  email: 'laura@example.com',
  phone: null,
  subject: 'Necesito los datos del DJ',
  message: 'Contraté al DJ y no llegó.',
  dueAt: '2026-10-20',
  businessDaysLeft: 10,
  resolution: null,
  resolvedAt: null,
  isSpam: false,
  createdAt: '2026-09-25T10:00:00.000Z',
  matchingBookings: 0,
};

const spamTicket: TicketDto = { ...dataTicket, id: 'cticket000000000000000002', type: 'PQRS_CONSULTA', subject: 'Gana dinero ya', isSpam: true };

const booking: BookingListItemDto = {
  id: 'cbook00000000000000000001',
  profile: dataTicket.profile!,
  contactName: 'Laura Gómez',
  contactEmail: 'laura@example.com',
  contactPhone: null,
  eventDate: '2026-11-14',
  status: 'READ',
  ownerDeleted: true,
  createdAt: '2026-09-28T20:10:00.000Z',
};

const bookingDetail: BookingDetailDto = {
  ...booking,
  fields: [],
  consentAt: booking.createdAt,
  consentVersion: '2026-09',
  readAt: booking.createdAt,
};

const stats: AdminStatsDto = {
  profiles: { DRAFT: 0, PENDING_REVIEW: 0, APPROVED: 1, REJECTED: 0, SUSPENDED: 0 },
  pendingReview: 0,
  bookingsLast30Days: 1,
  newBookings: 0,
  openTickets: 1,
  overdueTickets: 0,
  spamTickets: 1,
  users: 1,
  approvedWithoutLegal: [],
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
  params: Record<string, unknown>;
  stepUp: string | undefined;
  body: unknown;
}

const WAIT = { timeout: 10_000 };
let calls: Call[];
let client: QueryClient;
let writeText: ReturnType<typeof vi.fn>;

function renderAt(path: string, ui: ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ConfigProvider theme={{ token: { motion: false } }}>
            <AntApp>
              <StepUpProvider>{ui}</StepUpProvider>
            </AntApp>
          </ConfigProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

describe('admin M4', { timeout: 30_000 }, () => {
  beforeEach(() => {
    calls = [];
    invalidateStepUp();
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
    writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const adapter = async (config: InternalAxiosRequestConfig) => {
      const method = (config.method ?? 'get').toUpperCase();
      const url = config.url ?? '';
      const params = (config.params ?? {}) as Record<string, unknown>;
      const stepUp = AxiosHeaders.from(config.headers).get('X-Step-Up');
      const body = typeof config.data === 'string' && config.data ? (JSON.parse(config.data) as unknown) : undefined;
      calls.push({ method, url, params, stepUp: typeof stepUp === 'string' ? stepUp : undefined, body });
      if (method === 'GET') {
        if (url === '/admin/stats') return respond(config, 200, stats);
        if (url === '/admin/legal-records') {
          return respond(config, 200, page(params.state === 'closed' ? [closedItem] : [recordItem]));
        }
        if (url === `/admin/legal-records/${record.id}`) {
          return stepUp === 'su.token'
            ? respond(config, 200, record)
            : respond(config, 403, { statusCode: 403, code: 'STEP_UP_REQUIRED', message: 'x' });
        }
        if (url === '/admin/tickets') return respond(config, 200, page(params.spam === 'true' ? [spamTicket] : [dataTicket]));
        if (url === `/admin/tickets/${dataTicket.id}`) return respond(config, 200, dataTicket);
        if (url === '/admin/bookings') return respond(config, 200, page([booking]));
        if (url === `/admin/bookings/${booking.id}`) return respond(config, 200, bookingDetail);
        if (url === '/admin/profiles') return respond(config, 200, page([]));
      }
      if (method === 'POST' && url === '/auth/step-up') return respond(config, 200, { stepUpToken: 'su.token', expiresIn: 300 });
      if (method === 'POST' && url === `/admin/tickets/${dataTicket.id}/disclose-dj`) {
        return stepUp === 'su.token'
          ? respond(config, 200, { record, responseTemplate: TEMPLATE } satisfies DiscloseDjResultDto)
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

  it('Registros legales: la lista no muestra documentos; el detalle pide step-up y avisa que queda en la auditoría', async () => {
    renderAt('/admin/registros-legales', <LegalRecordsPage />);
    expect(await screen.findByText('Miguel Bran', undefined, WAIT)).toBeTruthy();
    expect(calls.find((c) => c.url === '/admin/legal-records')?.params).toMatchObject({ state: 'active', page: 1 });
    expect(document.body.textContent).not.toContain(DOC);
    // El detalle (auditado) solo se pide al abrirlo.
    expect(calls.some((c) => c.url === `/admin/legal-records/${record.id}`)).toBe(false);

    fireEvent.click(screen.getByText('Miguel Bran'));
    expect(await screen.findByText('Esta consulta queda registrada en la auditoría.', undefined, WAIT)).toBeTruthy();
    // Sin confirmar no hay petición ni datos.
    fireEvent.change(await screen.findByLabelText('Contraseña', undefined, WAIT), { target: { value: 'clave-del-admin-123' } });
    expect(calls.some((c) => c.url === `/admin/legal-records/${record.id}`)).toBe(false);
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '123456' } });
    fireEvent.click(await button('Confirmar'));
    expect(await screen.findByText(`Cédula de ciudadanía ${DOC}`, undefined, WAIT)).toBeTruthy();
    const detail = calls.filter((c) => c.url === `/admin/legal-records/${record.id}`);
    expect(detail).toHaveLength(1);
    expect(detail[0]?.stepUp).toBe('su.token');

    // «Conservados» pide los de perfiles borrados.
    fireEvent.click(screen.getByText('Conservados'));
    expect(await screen.findByText('Pedro Pérez', undefined, WAIT)).toBeTruthy();
    expect(calls.some((c) => c.url === '/admin/legal-records' && c.params.state === 'closed')).toBe(true);
  });

  it('PQRS: «Entregar datos del DJ» pide la verificación y step-up, y muestra la respuesta para copiar, sin dejarla en caché', async () => {
    renderAt('/admin/pqrs', <TicketsPage />);
    fireEvent.click(await screen.findByText('Necesito los datos del DJ', undefined, WAIT));
    // El correo no coincide con ninguna solicitud: lo avisa, y sin la casilla no se puede entregar.
    expect(await screen.findByText(/no coincide con ninguna solicitud de booking/, undefined, WAIT)).toBeTruthy();
    expect((await button('Entregar datos del DJ')).disabled).toBe(true);
    fireEvent.click(screen.getByText(/Verifiqué que quien pide contrató al DJ/));
    await waitFor(async () => expect((await button('Entregar datos del DJ')).disabled).toBe(false), WAIT);
    fireEvent.click(await button('Entregar datos del DJ'));
    fireEvent.click(await button('Continuar'));

    fireEvent.change(await screen.findByLabelText('Contraseña', undefined, WAIT), { target: { value: 'clave-del-admin-123' } });
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '123456' } });
    fireEvent.click(await button('Confirmar'));

    expect(await screen.findByText('Envía esta respuesta al correo del solicitante', undefined, WAIT)).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST' && c.url === `/admin/tickets/${dataTicket.id}/disclose-dj`);
    expect(post?.stepUp).toBe('su.token');
    expect(post?.body).toEqual({ confirmed: true });
    const textarea = screen.getByLabelText('Respuesta para el solicitante') as HTMLTextAreaElement;
    expect(textarea.value).toBe(TEMPLATE);
    expect(textarea.readOnly).toBe(true);

    fireEvent.click(await button('Copiar respuesta'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEMPLATE), WAIT);
    expect(cacheDump()).not.toContain(DOC);

    fireEvent.click(await button('Listo'));
    await waitFor(() => expect(screen.queryByLabelText('Respuesta para el solicitante')).toBeNull(), WAIT);
    expect(cacheDump()).not.toContain(DOC);
  });

  it('PQRS: «Mostrar spam» pide spam=true y marca las filas', async () => {
    renderAt('/admin/pqrs', <TicketsPage />);
    expect(await screen.findByText('Necesito los datos del DJ', undefined, WAIT)).toBeTruthy();
    expect(calls.find((c) => c.url === '/admin/tickets')?.params.spam).toBeUndefined();
    fireEvent.click(screen.getByText('Mostrar spam'));
    expect(await screen.findByText('Gana dinero ya', undefined, WAIT)).toBeTruthy();
    expect(calls.some((c) => c.url === '/admin/tickets' && c.params.spam === 'true')).toBe(true);
    expect(screen.getByText('Spam').closest('.ant-tag')).toBeTruthy();
  });

  it('Solicitudes: las que el DJ borró de su bandeja dicen «Oculta por el DJ»', async () => {
    renderAt('/admin/solicitudes', <BookingsPage />);
    expect(await screen.findByText('Oculta por el DJ', undefined, WAIT)).toBeTruthy();
    fireEvent.click(screen.getByText('Laura Gómez'));
    expect(await screen.findByText(/Se conserva aquí hasta que se cumplan los 12 meses/, undefined, WAIT)).toBeTruthy();
    expect(screen.getAllByText('Oculta por el DJ').length).toBeGreaterThan(1);
  });
});
