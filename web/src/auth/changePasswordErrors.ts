import { apiError } from '../lib/http';

/** Mensajes del POST /auth/change-password (lo usan /cambiar-clave y "Mi cuenta" del admin). */
export function changePasswordErrorMessage(e: unknown): { field: 'current' | 'new' | null; message: string } {
  const err = apiError(e);
  if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
    return { field: null, message: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' };
  }
  if (err.code === 'INVALID_CREDENTIALS') {
    return { field: 'current', message: 'La contraseña actual no es correcta.' };
  }
  // Otro 401 llega aquí solo si el refresh también falló: la sesión terminó.
  if (err.statusCode === 401) return { field: null, message: 'Tu sesión expiró. Ingresa de nuevo.' };
  if (err.code === 'SAME_PASSWORD' || err.code === 'PASSWORD_REUSED') {
    return { field: 'new', message: 'La contraseña nueva debe ser distinta de la actual.' };
  }
  if (err.code.startsWith('PASSWORD_') || err.details?.newPassword) {
    return { field: 'new', message: err.message || 'La contraseña nueva no cumple las reglas.' };
  }
  return { field: null, message: err.message };
}
