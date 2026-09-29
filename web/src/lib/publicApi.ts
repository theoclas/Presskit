import {
  API_ROUTES,
  type ApiErrorDto,
  type BookingSubmitDto,
  type BookingSubmitResultDto,
  type BookingTokenDto,
  type GenreCountDto,
  type PublicDjCardDto,
  type PublicDjProfileDto,
  type TicketSubmitDto,
  type TicketSubmitResultDto,
} from '@fersua/shared';

// Cliente mínimo con fetch para las páginas públicas (sin axios en este bundle).
// Sin tokens ni cookies propias: todo es anónimo y del mismo origen.

export class ApiError extends Error implements ApiErrorDto {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(dto: ApiErrorDto) {
    super(dto.message);
    this.name = 'ApiError';
    this.statusCode = dto.statusCode;
    this.code = dto.code;
    this.details = dto.details;
  }

  get isNetwork(): boolean {
    return this.statusCode === 0;
  }
}

const NETWORK_MESSAGE = 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';

function isErrorDto(v: unknown): v is ApiErrorDto {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.code === 'string' && typeof o.message === 'string';
}

function cleanDetails(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (isErrorDto(body)) {
    return new ApiError({
      statusCode: res.status,
      code: body.code,
      message: body.message,
      details: cleanDetails(body.details),
    });
  }
  return new ApiError({
    statusCode: res.status,
    code: res.status === 404 ? 'NOT_FOUND' : res.status === 429 ? 'RATE_LIMITED' : `HTTP_${res.status}`,
    message: res.status >= 500 ? 'El servidor no respondió bien. Intenta de nuevo en un momento.' : 'No se pudo completar la solicitud.',
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError({ statusCode: 0, code: 'NETWORK', message: NETWORK_MESSAGE });
  }
  if (!res.ok) throw await parseError(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError({ statusCode: res.status, code: 'BAD_RESPONSE', message: 'Respuesta inesperada del servidor.' });
  }
}

const enc = encodeURIComponent;

export const publicApi = {
  listDjs: (signal?: AbortSignal) => request<PublicDjCardDto[]>(API_ROUTES.publicDjs, { signal }),

  /** fetch sigue el 301 de SlugRedirect: el slug de la respuesta puede ser otro. */
  getDj: (slug: string, signal?: AbortSignal) => request<PublicDjProfileDto>(API_ROUTES.publicDj(enc(slug)), { signal }),

  listGenres: (signal?: AbortSignal) => request<GenreCountDto[]>(API_ROUTES.publicGenres, { signal }),

  getBookingToken: (slug: string) =>
    request<BookingTokenDto>(API_ROUTES.bookingToken(enc(slug)), { cache: 'no-store' }),

  submitBooking: (slug: string, body: BookingSubmitDto) =>
    request<BookingSubmitResultDto>(API_ROUTES.bookingRequests(enc(slug)), {
      method: 'POST',
      body: JSON.stringify(body),
      cache: 'no-store',
    }),

  submitTicket: (body: TicketSubmitDto) =>
    request<TicketSubmitResultDto>(API_ROUTES.tickets, { method: 'POST', body: JSON.stringify(body), cache: 'no-store' }),
};

/** Reintenta solo errores de red o del servidor, nunca un 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.isNetwork || error.statusCode >= 500;
  return true;
}
