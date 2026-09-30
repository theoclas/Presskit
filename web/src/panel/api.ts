import type {
  BookingDetailDto,
  BookingListItemDto,
  BookingStatus,
  Paginated,
  SlugAvailabilityDto,
  UnreadCountDto,
} from '@fersua/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '../lib/http';

// Datos del panel del DJ. Las claves empiezan por 'panel' (el editor usa las suyas, bajo
// 'editor'); el logout limpia la caché completa.

/** Base del editor del dueño: el api decide el perfil por el prefijo, nunca por un id. */
export const OWNER_BASE = '/me/profile';
export const OWNER_GENRES_URL = '/me/genres';

export interface OwnerBookingFilters {
  status: BookingStatus;
  page: number;
}

export const panelKeys = {
  all: ['panel'] as const,
  unread: ['panel', 'unread'] as const,
  bookingsAll: ['panel', 'bookings'] as const,
  bookings: (f: OwnerBookingFilters) => ['panel', 'bookings', f] as const,
  booking: (id: string) => ['panel', 'booking', id] as const,
  slug: (slug: string) => ['panel', 'slug-availability', slug] as const,
};

const enc = encodeURIComponent;

/** Solicitudes sin leer (insignia del menú). Se consulta cada 60 s solo con la pestaña visible. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: panelKeys.unread,
    queryFn: async ({ signal }) => (await http.get<UnreadCountDto>(`${OWNER_BASE}/bookings/unread-count`, { signal })).data,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** El api solo acepta status y page (sin pageSize): se usa el pageSize que devuelve. */
export function useOwnerBookings(f: OwnerBookingFilters) {
  return useQuery({
    queryKey: panelKeys.bookings(f),
    queryFn: async ({ signal }) =>
      (
        await http.get<Paginated<BookingListItemDto>>(`${OWNER_BASE}/bookings`, {
          params: { status: f.status, ...(f.page > 1 ? { page: f.page } : {}) },
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** Abrir el detalle la marca como leída en el api. */
export function useOwnerBooking(id: string | null) {
  return useQuery({
    queryKey: panelKeys.booking(id ?? ''),
    queryFn: async ({ signal }) => (await http.get<BookingDetailDto>(`${OWNER_BASE}/bookings/${enc(id ?? '')}`, { signal })).data,
    enabled: !!id,
    staleTime: 60_000,
  });
}

export async function fetchSlugAvailability(slug: string, signal?: AbortSignal): Promise<SlugAvailabilityDto> {
  const { data } = await http.get<SlugAvailabilityDto>(`${OWNER_BASE}/slug-availability`, { params: { slug }, signal });
  return data;
}
