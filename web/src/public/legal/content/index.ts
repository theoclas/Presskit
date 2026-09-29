// Punto de entrada del contenido legal: las páginas buscan el documento por su clave
// (la misma de LEGAL_DOCS en shared) o por su ruta pública.
import { LEGAL_DOCS } from '@fersua/shared';
import type { LegalDoc } from '../types';
import { privacyDoc } from './privacidad';
import { termsDoc } from './terminos';
import { artistTermsDoc } from './terminos-artistas';
import { pqrsDoc } from './pqrs';

export { privacyDoc, termsDoc, artistTermsDoc, pqrsDoc };
export { reportPage } from './reportar';
export type { ReportPageContent } from './reportar';

export const LEGAL_CONTENT: Record<LegalDoc['key'], LegalDoc> = {
  privacy: privacyDoc,
  terms: termsDoc,
  artistTerms: artistTermsDoc,
  pqrs: pqrsDoc,
};

/** Documento por ruta pública ('/privacidad', '/terminos', ...), o undefined. */
export function legalDocByPath(path: string): LegalDoc | undefined {
  const key = (Object.keys(LEGAL_DOCS) as LegalDoc['key'][]).find((k) => LEGAL_DOCS[k].path === path);
  return key ? LEGAL_CONTENT[key] : undefined;
}
