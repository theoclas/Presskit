import type {
  DocType,
  EventCtaType,
  FormConfigError,
  ProfileStatus,
  SlugError,
  SocialUrlError,
  TextGroup,
  TextsValidation,
} from '@fersua/shared';

// Textos de la interfaz del editor (español de Colombia, tuteo).

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  SUSPENDED: 'Suspendido',
};

/** Colores de AntD Tag por estado. */
export const PROFILE_STATUS_COLORS: Record<ProfileStatus, string> = {
  DRAFT: 'default',
  PENDING_REVIEW: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  SUSPENDED: 'volcano',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  PPT: 'Permiso por protección temporal (PPT)',
};

export const TEXT_GROUP_LABELS: Record<TextGroup, string> = {
  nav: 'Menú superior',
  hero: 'Portada',
  media: 'Tarjetas de rider y galería',
  artists: 'Sección de artistas',
  events: 'Sección de fechas',
  booking: 'Formulario de solicitud',
  footer: 'Pie de página',
};

export const CTA_TYPE_LABELS: Record<EventCtaType, string> = {
  WHATSAPP: 'WhatsApp',
  URL: 'Enlace (boletas)',
  NONE: 'Sin botón',
};

export const SLUG_ERROR_MESSAGES: Record<SlugError, string> = {
  FORMAT: 'Usa de 3 a 40 letras minúsculas, números o guiones (sin tildes, sin espacios, sin empezar ni terminar en guion).',
  RESERVED: 'Esa dirección está reservada. Prueba con otra.',
};

export const SOCIAL_URL_ERROR_MESSAGES: Record<SocialUrlError, string> = {
  INVALID_URL: 'No es un enlace válido.',
  HOST_NOT_ALLOWED: 'Ese enlace no es de esta red social.',
  NOT_HTTPS: 'El enlace debe empezar por https://',
  TOO_LONG: 'El enlace es demasiado largo.',
};

export const TEXT_ERROR_MESSAGES: Record<TextsValidation['errors'][string], string> = {
  UNKNOWN_KEY: 'Este texto no existe.',
  TOO_LONG: 'Es demasiado largo.',
  NOT_STRING: 'Valor no válido.',
  BAD_PLACEHOLDER: 'Solo puedes usar las variables indicadas entre llaves.',
};

export const FORM_CONFIG_ERROR_MESSAGES: Record<FormConfigError, string> = {
  NOT_ARRAY: 'La configuración del formulario no es válida.',
  TOO_MANY: 'Hay demasiados campos activos.',
  UNKNOWN_KEY: 'Este campo ya no existe en el catálogo; quítalo.',
  DUPLICATE_KEY: 'Este campo está repetido.',
  NAME_REQUIRED: 'El nombre siempre debe estar en el formulario.',
  CONTACT_REQUIRED:
    'Activa «Email» o «Teléfono / WhatsApp» y márcalo como obligatorio: sin eso no hay cómo responder la solicitud.',
  LABEL_TOO_LONG: 'La etiqueta es demasiado larga.',
  PLACEHOLDER_TOO_LONG: 'El texto de ejemplo es demasiado largo.',
  LABEL_NOT_ALLOWED:
    'Esa etiqueta no está permitida: el formulario no puede pedir datos de pago, claves ni documentos.',
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** Códigos de `details` que devuelve el api en un 400 VALIDATION_FAILED (campo → código). */
export const FIELD_ERROR_MESSAGES: Record<string, string> = {
  ...TEXT_ERROR_MESSAGES,
  ...SOCIAL_URL_ERROR_MESSAGES,
  ...SLUG_ERROR_MESSAGES,
  REQUIRED: 'Este campo es obligatorio.',
  TOO_SHORT: 'Es demasiado corto.',
  TOO_LONG: 'Es demasiado largo.',
  TOO_MANY: 'Hay demasiados elementos.',
  INVALID: 'Revisa este valor.',
  PAST: 'La fecha ya pasó.',
  TOO_FAR: 'La fecha está demasiado lejos (máximo 2 años).',
  TOO_OLD: 'La fecha es demasiado antigua.',
  DUPLICATE_PLATFORM: 'Esta red ya está en la lista.',
  DUPLICATE_URL: 'Este enlace está repetido.',
  WRONG_KIND: 'Esa foto no sirve para este lugar.',
  NOT_FOUND: 'Esa foto ya no existe; súbela de nuevo.',
};
