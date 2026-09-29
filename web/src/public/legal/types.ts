// Forma común de los documentos legales: las páginas /privacidad, /terminos, etc. los
// pintan como texto plano (sin HTML), con tabla de contenido a partir de las secciones.

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  key: 'privacy' | 'terms' | 'artistTerms' | 'pqrs';
  title: string;
  version: string;
  updatedAt: string;
  intro?: string[];
  sections: LegalSection[];
}
