import { apiError } from '../lib/http';

// Códigos de error del api -> mensajes para el DJ. El api ya manda `message` en español;
// este mapa unifica el tono y dice qué hacer en los casos del panel.

export const PANEL_ERROR_MESSAGES: Record<string, string> = {
  NETWORK: 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.',
  CANCELED: 'Se canceló la solicitud.',
  UNKNOWN: 'Ocurrió un error inesperado. Intenta de nuevo.',
  RATE_LIMITED: 'Demasiados intentos seguidos. Espera un momento e intenta de nuevo.',
  UNAUTHORIZED: 'Tu sesión expiró. Ingresa de nuevo.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'Ya no existe. Puede que se haya borrado mientras lo veías.',
  NO_PROFILE: 'Aún no tienes un perfil DJ.',
  PROFILE_EXISTS: 'Ya tienes un perfil DJ.',
  EMAIL_NOT_VERIFIED: 'Primero confirma tu correo: abre el enlace que te enviamos o pide uno nuevo en el aviso de arriba.',
  TERMS_ACCEPTANCE_REQUIRED: 'Debes aceptar los términos actualizados para continuar.',
  PASSWORD_CHANGE_REQUIRED: 'Debes cambiar tu contraseña temporal antes de continuar.',
  SLUG_TAKEN: 'Esa dirección ya la usa otro perfil. Prueba con otra.',
  SLUG_RESERVED: 'Esa dirección está reservada. Prueba con otra.',
  INVALID_TRANSITION: 'Tu perfil cambió de estado. Recarga para ver cómo está ahora.',
};

/** Mensaje listo para mostrar (message.error, Alert). */
export function panelErrorMessage(e: unknown): string {
  const err = apiError(e);
  if (err.code === 'VALIDATION_FAILED') return err.message || 'Revisa los datos enviados.';
  if (err.statusCode === 429) return PANEL_ERROR_MESSAGES.RATE_LIMITED!;
  return PANEL_ERROR_MESSAGES[err.code] ?? (err.message || PANEL_ERROR_MESSAGES.UNKNOWN!);
}
