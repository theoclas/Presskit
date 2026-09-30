// Contrato de M3: registro, recuperación de contraseña y panel del DJ (dueño de su perfil).
// Rutas en docs/api-m3.md. Lo que ya existe para el editor (EditorProfileDto, inputs, media)
// está en admin-types.ts y se reutiliza tal cual con base '/me/profile'.

export interface RegistrationStatusDto {
  /** Refleja REGISTRATION_OPEN del servidor. */
  open: boolean;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  /** Términos para Artistas (LEGAL_DOCS.artistTerms). */
  acceptTerms: true;
  /** Política de Tratamiento de Datos (LEGAL_DOCS.privacy). */
  acceptPrivacy: true;
  /** Declaración de mayoría de edad. */
  confirmAge: true;
  /** Honeypot: debe llegar vacío. */
  hp_x7?: string;
}

export interface VerifyEmailInput {
  token: string;
}

export interface ForgotPasswordInput {
  /** Usuario o correo. La respuesta es siempre la misma (202), exista o no. */
  identifier: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

/** Re-aceptación cuando cambia la versión de los términos o de la política. */
export interface AcceptTermsInput {
  acceptTerms: true;
  acceptPrivacy: true;
}

export interface OnboardingInput {
  displayName: string;
  slug: string;
}

export interface SlugAvailabilityDto {
  available: boolean;
  reason?: 'FORMAT' | 'RESERVED' | 'TAKEN';
}

/** Género activo con id, para el selector del editor del dueño (GET /api/me/genres). */
export interface OwnerGenreDto {
  id: number;
  slug: string;
  name: string;
}

export interface UnreadCountDto {
  count: number;
}
