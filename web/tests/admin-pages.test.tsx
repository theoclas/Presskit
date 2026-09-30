import type {
  AdminStatsDto,
  AuditLogDto,
  BookingDetailDto,
  BookingListItemDto,
  GenreAdminDto,
  MeDto,
  Paginated,
  TicketDto,
} from '@fersua/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPage } from '../src/admin/pages/AccountPage';
import { AuditPage } from '../src/admin/pages/AuditPage';
import { BookingsPage } from '../src/admin/pages/BookingsPage';
import { GenresPage } from '../src/admin/pages/GenresPage';
import { OverviewPage } from '../src/admin/pages/OverviewPage';
import { TicketsPage } from '../src/admin/pages/TicketsPage';
import { AuthProvider } from '../src/auth/AuthProvider';
import { StepUpProvider } from '../src/auth/useStepUp';
import { applySession, clearLocalSession, http, rawHttp } from '../src/lib/http';

// Humo de las páginas del admin con el api simulado: que carguen, muestren lo esencial como
// texto plano y no disparen avisos de props obsoletas de AntD.

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

const prof = { id: 'cprof00000000000000000001', slug: 'macfly-mike-bran', displayName: 'Mac Fly & Mike Bran' };

const booking: BookingListItemDto = {
  id: 'cbook00000000000000000001',
  profile: prof,
  contactName: 'Laura Gómez',
  contactEmail: 'laura@example.com',
  contactPhone: '300 123 4567',
  eventDate: '2026-11-14',
  status: 'NEW',
  ownerDeleted: false,
  createdAt: '2026-09-28T20:10:00.000Z',
};

const bookingDetail: BookingDetailDto = {
  ...booking,
  fields: [{ key: 'message', label: 'Detalles del evento', value: 'Línea 1\n<b>no es html</b>' }],
  consentAt: booking.createdAt,
  consentVersion: '2026-09',
  readAt: null,
};

function ticket(over: Partial<TicketDto>): TicketDto {
  return {
    id: 'PQ-1',
    type: 'PQRS_RECLAMO',
    status: 'OPEN',
    profile: null,
    profileSlug: null,
    name: 'Ana',
    email: 'ana@example.com',
    phone: null,
    subject: 'Asunto',
    message: 'Mensaje',
    dueAt: '2026-10-20',
    businessDaysLeft: 10,
    resolution: null,
    resolvedAt: null,
    isSpam: false,
    createdAt: '2026-09-10T10:00:00.000Z',
    ...over,
  };
}

const stats: AdminStatsDto = {
  profiles: { DRAFT: 2, PENDING_REVIEW: 1, APPROVED: 1, REJECTED: 0, SUSPENDED: 0 },
  pendingReview: 1,
  bookingsLast30Days: 12,
  newBookings: 3,
  openTickets: 3,
  overdueTickets: 1,
  spamTickets: 0,
  users: 2,
  approvedWithoutLegal: [],
};

const genres: GenreAdminDto[] = [
  { id: 1, slug: 'house', name: 'House', isActive: true, sortOrder: 1, profiles: 1 },
  { id: 2, slug: 'techno', name: 'Techno', isActive: false, sortOrder: 2, profiles: 0 },
];

const audit: AuditLogDto[] = [
  {
    id: 'a1',
    actorUsername: 'fersua',
    action: 'admin.user.create',
    targetType: 'User',
    targetId: 'cdjuno0000000000000000001',
    profileId: null,
    metadata: { username: 'dj.uno', note: '<img src=x onerror=alert(1)>' },
    createdAt: '2026-09-20T00:00:00.000Z',
  },
];

const page = <T,>(items: T[]): Paginated<T> => ({ items, page: 1, pageSize: 20, total: items.length });

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) return Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response));
  return Promise.resolve(response);
}

const WAIT = { timeout: 10_000 };
let antdWarnings: string[];

function renderAt(path: string, ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('páginas del admin', { timeout: 30_000 }, () => {
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

    const adapter = async (config: InternalAxiosRequestConfig) => {
      const method = (config.method ?? 'get').toUpperCase();
      const url = config.url ?? '';
      if (method === 'GET') {
        if (url === '/admin/stats') return respond(config, 200, stats);
        if (url === '/admin/bookings') return respond(config, 200, page([booking]));
        if (url === `/admin/bookings/${booking.id}`) return respond(config, 200, bookingDetail);
        if (url === '/admin/tickets') {
          return respond(
            config,
            200,
            page([
              ticket({ id: 'PQ-1', subject: 'Vencido', businessDaysLeft: -2 }),
              ticket({ id: 'PQ-2', subject: 'Por vencer', businessDaysLeft: 2 }),
              ticket({ id: 'PQ-3', subject: 'Con tiempo', businessDaysLeft: 12 }),
            ]),
          );
        }
        if (url === '/admin/genres') return respond(config, 200, genres);
        if (url === '/admin/audit-logs') return respond(config, 200, page(audit));
        if (url === '/admin/profiles') return respond(config, 200, page([]));
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

  it('Resumen: contadores con enlaces y el aviso de vencidos', async () => {
    renderAt('/admin', <OverviewPage />);
    expect(await screen.findByText('Perfiles por revisar', undefined, WAIT)).toBeTruthy();
    expect(screen.getByText('1 vencido')).toBeTruthy();
    const link = screen.getByText('Revisar perfiles').closest('a');
    expect(link?.getAttribute('href')).toBe('/admin/djs?estado=PENDING_REVIEW');
    expect(antdWarnings).toEqual([]);
  });

  it('Solicitudes: detalle como texto plano, con WhatsApp y correo', async () => {
    renderAt('/admin/solicitudes', <BookingsPage />);
    fireEvent.click(await screen.findByText('Laura Gómez', undefined, WAIT));
    expect(await screen.findByText('Datos enviados', undefined, WAIT)).toBeTruthy();
    // El valor llega tal cual: '<b>' se ve como texto, nunca como HTML.
    const value = await screen.findByText(/no es html/, undefined, WAIT);
    expect(value.textContent).toBe('Línea 1\n<b>no es html</b>');
    expect(document.querySelector('.ant-drawer b')).toBeNull();
    const wa = screen.getByText('Responder por WhatsApp').closest('a');
    expect(wa?.getAttribute('href')).toBe('https://wa.me/573001234567');
    expect(wa?.getAttribute('rel')).toContain('noopener');
    const mail = screen.getByText('Responder por correo').closest('a');
    expect(mail?.getAttribute('href')).toMatch(/^mailto:laura@example\.com\?subject=/);
    expect(antdWarnings).toEqual([]);
  });

  it('PQRS: plazo vencido en rojo, 3 días o menos en naranja', async () => {
    renderAt('/admin/pqrs', <TicketsPage />);
    const overdue = await screen.findByText('Vencido hace 2 días hábiles', undefined, WAIT);
    const soon = screen.getByText('2 días hábiles');
    expect(overdue.closest('.ant-tag')?.className).toMatch(/red/);
    expect(soon.closest('.ant-tag')?.className).toMatch(/orange/);
    expect(screen.queryByText(/12 días/)).toBeNull();
    expect(antdWarnings).toEqual([]);
  });

  it('Géneros: lista con su estado y cuántos perfiles lo usan', async () => {
    renderAt('/admin/generos', <GenresPage />);
    expect(await screen.findByText('House', undefined, WAIT)).toBeTruthy();
    expect(screen.getByText('Techno')).toBeTruthy();
    const switches = document.querySelectorAll('button[role="switch"]');
    expect([...switches].map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(antdWarnings).toEqual([]);
  });

  it('Auditoría: los metadatos se muestran como JSON de texto', async () => {
    renderAt('/admin/auditoria', <AuditPage />);
    // La acción se lee en español; el código queda en el tooltip.
    expect(await screen.findByText('Creó una cuenta', undefined, WAIT)).toBeTruthy();
    const expand = document.querySelector('.ant-table-row-expand-icon') as HTMLElement | null;
    expect(expand).not.toBeNull();
    fireEvent.click(expand!);
    const pre = await waitFor(() => {
      const el = document.querySelector('pre.admin-json');
      if (!el) throw new Error('sin JSON');
      return el;
    }, WAIT);
    expect(pre.textContent).toContain('"username": "dj.uno"');
    expect(pre.querySelector('img')).toBeNull();
    expect(antdWarnings).toEqual([]);
  });

  it('Mi cuenta: exige 12 caracteres para el admin', async () => {
    renderAt('/admin/cuenta', <AccountPage />);
    expect(await screen.findByText('Verificación en dos pasos', undefined, WAIT)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123456' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'corta-123' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: 'corta-123' } });
    fireEvent.click(screen.getByText('Guardar contraseña').closest('button')!);
    expect(await screen.findByText('Usa al menos 12 caracteres.', undefined, WAIT)).toBeTruthy();
    expect(antdWarnings).toEqual([]);
  });
});
