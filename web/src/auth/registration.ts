import type { RegistrationStatusDto } from '@fersua/shared';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../lib/http';

export const REGISTRATION_QUERY_KEY = ['auth', 'registration'] as const;

/**
 * GET /api/auth/registration. Es público y el servidor lo cachea 60 s: va con fetch, sin los
 * interceptores de sesión de axios (no manda el token ni dispara un refresh).
 */
export async function fetchRegistrationStatus(signal?: AbortSignal): Promise<RegistrationStatusDto> {
  const res = await fetch(`${API_BASE}/auth/registration`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  // Solo `open: true` abre el formulario; cualquier otra respuesta cuenta como cerrado.
  return { open: !!body && typeof body === 'object' && (body as { open?: unknown }).open === true };
}

/** Si el registro está abierto (para /registro y el enlace "Crea tu cuenta" de /login). */
export function useRegistrationStatus() {
  return useQuery({
    queryKey: REGISTRATION_QUERY_KEY,
    queryFn: ({ signal }) => fetchRegistrationStatus(signal),
    staleTime: 60_000,
    retry: false,
  });
}
