import type { UserRole } from '@prisma/client';
import { LEGAL_DOCS } from '@fersua/shared';

/** Lo mínimo para decidir si hay que volver a aceptar los documentos legales. */
export interface TermsState {
  role: UserRole;
  termsVersion: string | null;
  privacyVersion: string | null;
}

/**
 * true si un USER aceptó una versión de los Términos para Artistas o de la Política de Datos
 * que ya no es la vigente (o nunca aceptó, p. ej. una cuenta creada por el admin). El admin no
 * acepta términos de artista: para él siempre es false. Lo usan MeDto y el TermsGuard.
 */
export function isTermsOutdated(u: TermsState): boolean {
  if (u.role !== 'USER') return false;
  return u.termsVersion !== LEGAL_DOCS.artistTerms.version || u.privacyVersion !== LEGAL_DOCS.privacy.version;
}

/** Datos que se guardan al aceptar (registro o re-aceptación). */
export function acceptedTermsData(now: Date) {
  return {
    termsVersion: LEGAL_DOCS.artistTerms.version,
    termsAcceptedAt: now,
    privacyVersion: LEGAL_DOCS.privacy.version,
    privacyAcceptedAt: now,
  };
}
