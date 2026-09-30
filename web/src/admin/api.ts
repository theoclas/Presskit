import type {
  AdminLegalRecordDto,
  AdminLegalRecordListItemDto,
  AdminProfileListItemDto,
  AdminStatsDto,
  AdminUserDto,
  AuditLogDto,
  BookingDetailDto,
  BookingListItemDto,
  BookingStatus,
  GenreAdminDto,
  LegalRecordState,
  Paginated,
  TicketDto,
  TicketStatus,
  TicketType,
  UserStatus,
} from '@fersua/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useStepUp } from '../auth/useStepUp';
import { http, stepUpHeaders } from '../lib/http';
import { withStepUp } from './errors';
import { cleanParams } from './format';

// Todas las claves del admin empiezan por 'admin': el editor de perfiles invalida ['admin']
// después de guardar, y el logout limpia la caché completa.

export interface BookingFilters {
  profileId?: string;
  status?: BookingStatus;
  q?: string;
  from?: string;
  to?: string;
  page: number;
}

export interface TicketFilters {
  status?: TicketStatus;
  type?: TicketType;
  /** 'true': solo lo que el api marcó como spam (sin el filtro, el spam no viene). */
  spam?: 'true';
  page: number;
}

export interface LegalRecordFilters {
  state: LegalRecordState;
  q?: string;
  page: number;
}

export interface UserFilters {
  q?: string;
  status?: UserStatus;
  page: number;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  profileId?: string;
  from?: string;
  to?: string;
  page: number;
}

export const PAGE_SIZE = 20;

export const adminKeys = {
  all: ['admin'] as const,
  stats: ['admin', 'stats'] as const,
  bookings: (f: BookingFilters) => ['admin', 'bookings', f] as const,
  booking: (id: string) => ['admin', 'booking', id] as const,
  tickets: (f: TicketFilters) => ['admin', 'tickets', f] as const,
  ticket: (id: string) => ['admin', 'ticket', id] as const,
  users: (f: UserFilters) => ['admin', 'users', f] as const,
  genres: ['admin', 'genres'] as const,
  audit: (f: AuditFilters) => ['admin', 'audit', f] as const,
  legalRecords: (f: LegalRecordFilters) => ['admin', 'legal-records', f] as const,
  legalRecord: (id: string) => ['admin', 'legal-record', id] as const,
  profileOptions: ['admin', 'profiles', 'options'] as const,
};

const enc = encodeURIComponent;

/** Contadores del resumen y de las insignias del menú (se refrescan cada minuto). */
export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats,
    queryFn: async ({ signal }) => (await http.get<AdminStatsDto>('/admin/stats', { signal })).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useBookings(f: BookingFilters) {
  return useQuery({
    queryKey: adminKeys.bookings(f),
    queryFn: async ({ signal }) =>
      (
        await http.get<Paginated<BookingListItemDto>>('/admin/bookings', {
          params: cleanParams({ ...f, pageSize: PAGE_SIZE }),
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** El api audita cada lectura del detalle (admin.booking.view): solo se pide al abrirlo. */
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: adminKeys.booking(id ?? ''),
    queryFn: async ({ signal }) => (await http.get<BookingDetailDto>(`/admin/bookings/${enc(id ?? '')}`, { signal })).data,
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useTickets(f: TicketFilters) {
  return useQuery({
    queryKey: adminKeys.tickets(f),
    queryFn: async ({ signal }) =>
      (await http.get<Paginated<TicketDto>>('/admin/tickets', { params: cleanParams({ ...f, pageSize: PAGE_SIZE }), signal }))
        .data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: adminKeys.ticket(id ?? ''),
    queryFn: async ({ signal }) => (await http.get<TicketDto>(`/admin/tickets/${enc(id ?? '')}`, { signal })).data,
    enabled: !!id,
  });
}

export function useUsers(f: UserFilters) {
  return useQuery({
    queryKey: adminKeys.users(f),
    queryFn: async ({ signal }) =>
      (await http.get<Paginated<AdminUserDto>>('/admin/users', { params: cleanParams({ ...f, pageSize: PAGE_SIZE }), signal }))
        .data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: adminKeys.genres,
    queryFn: async ({ signal }) => (await http.get<GenreAdminDto[]>('/admin/genres', { signal })).data,
    staleTime: 30_000,
  });
}

export function useAuditLogs(f: AuditFilters) {
  return useQuery({
    queryKey: adminKeys.audit(f),
    queryFn: async ({ signal }) =>
      (
        await http.get<Paginated<AuditLogDto>>('/admin/audit-logs', {
          params: cleanParams({ ...f, pageSize: PAGE_SIZE }),
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** Registros del art. 53: la lista no trae números de documento. */
export function useLegalRecords(f: LegalRecordFilters) {
  return useQuery({
    queryKey: adminKeys.legalRecords(f),
    queryFn: async ({ signal }) =>
      (
        await http.get<Paginated<AdminLegalRecordListItemDto>>('/admin/legal-records', {
          params: cleanParams({ ...f, pageSize: PAGE_SIZE }),
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/**
 * Detalle con el documento completo. El api audita cada lectura: solo se pide al abrirlo, no
 * se vuelve a pedir solo y sale de la caché al cerrar (gcTime 0).
 */
/**
 * Detalle de un registro del art. 53 (documento, dirección y teléfonos). El api exige step-up
 * (contraseña + código): null = el admin canceló la confirmación.
 */
export function useLegalRecord(id: string | null) {
  const stepUp = useStepUp();
  return useQuery({
    queryKey: adminKeys.legalRecord(id ?? ''),
    queryFn: async ({ signal }): Promise<AdminLegalRecordDto | null> => {
      const res = await withStepUp(stepUp, async (t) =>
        (await http.get<AdminLegalRecordDto>(`/admin/legal-records/${enc(id ?? '')}`, { signal, headers: stepUpHeaders(t) })).data,
      );
      return res ? res.value : null;
    },
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 0,
    // Un reintento automático volvería a pedir la contraseña sin que el admin lo pidiera.
    retry: false,
  });
}

/** Lista corta de perfiles para los filtros por DJ (máximo 100, ordenados por nombre). */
export function useProfileOptions() {
  return useQuery({
    queryKey: adminKeys.profileOptions,
    queryFn: async ({ signal }) => {
      const { data } = await http.get<Paginated<AdminProfileListItemDto>>('/admin/profiles', {
        params: { page: 1, pageSize: 100 },
        signal,
      });
      return data.items
        .map((p) => ({ value: p.id, label: p.displayName || p.slug }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    },
    staleTime: 5 * 60_000,
  });
}
