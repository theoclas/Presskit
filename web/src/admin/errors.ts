import { invalidateStepUp } from '../auth/useStepUp';
import { apiError } from '../lib/http';

// Códigos de error del api -> mensajes para el admin. El api ya manda `message` en español;
// este mapa unifica el tono y cubre los casos donde conviene decir qué hacer.

export const ERROR_MESSAGES: Record<string, string> = {
  NETWORK: 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.',
  CANCELED: 'Se canceló la solicitud.',
  UNKNOWN: 'Ocurrió un error inesperado. Intenta de nuevo.',
  RATE_LIMITED: 'Demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.',
  UNAUTHORIZED: 'Tu sesión expiró. Ingresa de nuevo.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'Ya no existe. Puede que se haya borrado mientras lo veías.',
  PAYLOAD_TOO_LARGE: 'La solicitud es demasiado grande.',
  PASSWORD_CHANGE_REQUIRED: 'Debes cambiar tu contraseña temporal antes de continuar.',
  STEP_UP_REQUIRED: 'Por seguridad, confirma de nuevo tu contraseña y tu código.',
  STEP_UP_INVALID: 'La confirmación venció. Vuelve a escribir tu contraseña y tu código.',
  INVALID_CREDENTIALS: 'La contraseña o el código no son correctos.',
  // Usuarios
  USERNAME_TAKEN: 'Ese nombre de usuario ya existe.',
  EMAIL_TAKEN: 'Ese correo ya está registrado en otra cuenta.',
  CANNOT_TARGET_SELF: 'No puedes hacer esto sobre tu propia cuenta.',
  CANNOT_TARGET_ADMIN: 'La cuenta del administrador solo se gestiona desde la consola del servidor.',
  CONFIRM_MISMATCH: 'El texto de confirmación no coincide. Escríbelo exactamente igual.',
  // Géneros
  GENRE_IN_USE: 'Este género está en uso en algún perfil. Desactívalo en lugar de borrarlo.',
  GENRE_NAME_TAKEN: 'Ya existe un género con ese nombre.',
  // Perfiles
  LEGAL_INFO_REQUIRED: 'Falta el registro de datos legales del DJ (art. 53). Cárgalo antes de publicar el perfil.',
  SLUG_TAKEN: 'Esa dirección ya la usa otro perfil.',
  USER_NOT_ELIGIBLE: 'Esa cuenta no puede recibir el perfil: debe ser un DJ activo y sin otro perfil.',
  PROFILE_HAS_OPEN_TICKETS:
    'Este perfil tiene reportes o solicitudes de datos sin cerrar. Atiéndelos en «PQRS y reportes» antes de borrarlo.',
  AUTH_IN_PROGRESS: 'Estamos revisando otra confirmación. Espera un momento y vuelve a intentarlo.',
};

const GENERIC_VALIDATION = 'Revisa los datos enviados.';

/** Mensaje listo para mostrar (message.error, Alert). */
export function errorMessage(e: unknown): string {
  const err = apiError(e);
  // Un 400 VALIDATION_FAILED trae un mensaje concreto del api ("Ese nombre de usuario está
  // reservado.", "El nombre es muy corto."): en español y nunca con los valores enviados.
  if (err.code === 'VALIDATION_FAILED') return err.message || GENERIC_VALIDATION;
  return ERROR_MESSAGES[err.code] ?? (err.message || 'Ocurrió un error inesperado. Intenta de nuevo.');
}

/** El api rechazó (o dio por vencido) el token de step-up: hay que pedirlo de nuevo. */
export function isStepUpRejected(e: unknown): boolean {
  const err = apiError(e);
  return err.code.startsWith('STEP_UP');
}

/**
 * Corre una acción que exige step-up. Si el api rechaza el token (venció o se reinició el
 * servidor), lo olvida y lo pide una vez más. Devuelve undefined si el admin cancela.
 */
export async function withStepUp<T>(
  stepUp: () => Promise<string | null>,
  run: (token: string) => Promise<T>,
): Promise<{ value: T } | undefined> {
  const first = await stepUp();
  if (!first) return undefined;
  try {
    return { value: await run(first) };
  } catch (e) {
    if (!isStepUpRejected(e)) throw e;
    invalidateStepUp();
    const second = await stepUp();
    if (!second) return undefined;
    return { value: await run(second) };
  }
}
