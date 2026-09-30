import { isValidEmail, normalizeUsername, validateUsername, type UsernameError } from '@fersua/shared';
import { apiError } from '../lib/http';
import { checkNewPassword } from './passwordPolicy';

// Validación del formulario de /registro. Es la misma que aplica el api (shared); aquí solo
// sirve para avisar antes de enviar.

export interface RegisterValues {
  username: string;
  email: string;
  password: string;
  confirm: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  confirmAge: boolean;
}

export type RegisterField = keyof RegisterValues;
export type RegisterErrors = Partial<Record<RegisterField, string>>;

/** Orden del formulario: el foco va al primer campo con error. */
export const REGISTER_FIELDS: readonly RegisterField[] = [
  'username',
  'email',
  'password',
  'confirm',
  'acceptTerms',
  'acceptPrivacy',
  'confirmAge',
];

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  username: '',
  email: '',
  password: '',
  confirm: '',
  acceptTerms: false,
  acceptPrivacy: false,
  confirmAge: false,
};

export const USERNAME_HINT =
  'De 3 a 24 caracteres: letras minúsculas sin tildes, números, punto (.) o guion bajo (_). Con él ingresas; no es la dirección de tu página.';

export const CONSENT_REQUIRED: Record<'acceptTerms' | 'acceptPrivacy' | 'confirmAge', string> = {
  acceptTerms: 'Debes aceptar los Términos para Artistas para crear tu cuenta.',
  acceptPrivacy: 'Debes autorizar el tratamiento de tus datos para crear tu cuenta.',
  confirmAge: 'Debes ser mayor de 18 años para crear una cuenta.',
};

export function usernameErrorMessage(err: UsernameError): string {
  return err === 'RESERVED'
    ? 'Ese nombre de usuario está reservado. Elige otro.'
    : 'Usa de 3 a 24 caracteres: letras sin tildes, números, punto o guion bajo (sin empezar ni terminar con ellos, ni dos seguidos).';
}

export function validateRegister(v: RegisterValues): RegisterErrors {
  const errs: RegisterErrors = {};
  const username = normalizeUsername(v.username);
  if (!username) errs.username = 'Escribe un nombre de usuario.';
  else {
    const u = validateUsername(username);
    if (u) errs.username = usernameErrorMessage(u);
  }

  const email = v.email.trim();
  if (!email) errs.email = 'Escribe tu correo.';
  else if (!isValidEmail(email)) errs.email = 'Revisa el correo: parece que no es válido.';

  if (!v.password) errs.password = 'Escribe una contraseña.';
  else {
    const p = checkNewPassword(v.password, { username, role: 'USER' });
    if (p) errs.password = p;
  }
  if (!errs.password && v.confirm !== v.password) errs.confirm = 'Las contraseñas no coinciden.';

  if (!v.acceptTerms) errs.acceptTerms = CONSENT_REQUIRED.acceptTerms;
  if (!v.acceptPrivacy) errs.acceptPrivacy = CONSENT_REQUIRED.acceptPrivacy;
  if (!v.confirmAge) errs.confirmAge = CONSENT_REQUIRED.confirmAge;
  return errs;
}

export function firstRegisterError(errs: RegisterErrors): RegisterField | null {
  return REGISTER_FIELDS.find((k) => errs[k]) ?? null;
}

export type RegisterFailure =
  | { kind: 'closed' }
  | { kind: 'field'; field: RegisterField; message: string; emailTaken?: boolean }
  | { kind: 'alert'; message: string };

/** Respuesta de error del POST /auth/register en español. */
export function registerFailure(e: unknown): RegisterFailure {
  const err = apiError(e);
  if (err.code === 'REGISTRATION_CLOSED') return { kind: 'closed' };
  // Cupo diario de correos de confirmación agotado: el mensaje del api dice qué hacer.
  if (err.code === 'REGISTRATION_BUSY') {
    return { kind: 'alert', message: err.message || 'Hoy no podemos enviar más correos de confirmación. Intenta de nuevo mañana.' };
  }
  if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
    return { kind: 'alert', message: 'Hiciste demasiados intentos. Espera un rato antes de volver a intentarlo.' };
  }
  if (err.code === 'USERNAME_TAKEN') {
    return { kind: 'field', field: 'username', message: 'Ese nombre de usuario ya está en uso. Prueba con otro.' };
  }
  if (err.code === 'EMAIL_TAKEN') {
    return {
      kind: 'field',
      field: 'email',
      message: 'Ya existe una cuenta con ese correo. Si es tuya, ingresa o recupera tu contraseña.',
      emailTaken: true,
    };
  }
  if (err.code.startsWith('USERNAME_') || err.details?.username) {
    return { kind: 'field', field: 'username', message: err.message || usernameErrorMessage('FORMAT') };
  }
  if (err.code.startsWith('EMAIL_') || err.details?.email) {
    return { kind: 'field', field: 'email', message: err.message || 'Revisa el correo: parece que no es válido.' };
  }
  if (err.code.startsWith('PASSWORD_') || err.details?.password || err.details?.newPassword) {
    return { kind: 'field', field: 'password', message: err.message || 'La contraseña no cumple las reglas.' };
  }
  if (err.statusCode >= 500) return { kind: 'alert', message: 'El servidor no respondió bien. Intenta de nuevo en un momento.' };
  return { kind: 'alert', message: err.message };
}
