// Versiones de los documentos legales. Al cambiar el texto de un documento se sube su
// versión aquí: los consentimientos guardan la versión aceptada y el panel pide aceptar de nuevo.

export const LEGAL_DOCS = {
  privacy: { version: '2026-09', path: '/privacidad', title: 'Política de Tratamiento de Datos Personales' },
  terms: { version: '2026-09', path: '/terminos', title: 'Términos y Condiciones de Uso' },
  artistTerms: { version: '2026-09', path: '/terminos-artistas', title: 'Términos para Artistas' },
  pqrs: { version: '2026-09', path: '/pqrs', title: 'PQRS y Habeas Data' },
} as const;

export type LegalDocKey = keyof typeof LEGAL_DOCS;

/** Versión que se guarda en cada solicitud de booking como prueba de autorización. */
export const CONSENT_VERSION = LEGAL_DOCS.privacy.version;

/** Plazos de respuesta de la Ley 1581 (art. 14 y 15), en días hábiles. */
export const PQRS_DEADLINE_BUSINESS_DAYS = {
  PQRS_CONSULTA: 10,
  PQRS_RECLAMO: 15,
  REPORTE_PERFIL: 10,
  SOLICITUD_DATOS_DJ: 15,
} as const;

export const BOOKING_CONSENT_TEXT =
  'Autorizo el tratamiento de mis datos personales para gestionar esta solicitud, conforme a la Política de Tratamiento de Datos Personales (Ley 1581 de 2012).';

export const CONTACT_PORTAL_NOTICE =
  'Fersua Studio es un portal de contacto: no presta el servicio del DJ ni recibe pagos. El acuerdo se hace directamente con el artista.';

export const REGISTER_CONSENTS = {
  terms: 'Acepto los Términos para Artistas.',
  data: 'Autorizo el tratamiento de mis datos personales conforme a la Política de Tratamiento de Datos Personales.',
  age: 'Declaro que soy mayor de 18 años.',
} as const;
