import type { ProfileStatus, UserStatus } from '@fersua/shared';

/**
 * Misma regla que el api (public-profile.resolver): un perfil aprobado solo se ve en público
 * si no tiene dueño o si la cuenta del dueño está activa.
 */
export function isPubliclyVisible(p: { status: ProfileStatus; owner: { status: UserStatus } | null }): boolean {
  return p.status === 'APPROVED' && (!p.owner || p.owner.status === 'ACTIVE');
}

/** Aprobado, pero oculto porque la cuenta del dueño está suspendida. */
export function hiddenByOwner(p: { status: ProfileStatus; owner: { status: UserStatus } | null }): boolean {
  return p.status === 'APPROVED' && !!p.owner && p.owner.status !== 'ACTIVE';
}

/** Nombres de lo que falta para publicar (claves de EditorProfileDto.publishMissing). */
const PUBLISH_MISSING_LABELS: Record<string, string> = {
  displayName: 'Nombre artístico',
  slug: 'Dirección del perfil válida',
  'texts.heroTitle': 'Título principal',
  heroImage: 'Foto principal',
  genres: 'Al menos un género',
  members: 'Al menos un integrante',
  bookingForm: 'Formulario de solicitudes válido',
  contact: 'WhatsApp o un campo de contacto obligatorio en el formulario',
  legalInfo: 'Datos legales (art. 53)',
};

export function publishMissingLabels(keys: readonly string[]): string[] {
  return keys.map((k) => PUBLISH_MISSING_LABELS[k] ?? k);
}
