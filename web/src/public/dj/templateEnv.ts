import { createContext, useContext } from 'react';

/**
 * Ventana y documento sobre los que trabajan las plantillas (scroll, teclado, <html>). En la página
 * pública son los de siempre; en la vista previa en vivo del editor, los del iframe donde se dibuja
 * la página, así sus efectos no tocan el editor.
 */
export interface TemplateEnv {
  win: Window;
  doc: Document;
}

const DEFAULT_ENV: TemplateEnv | null = typeof window !== 'undefined' ? { win: window, doc: document } : null;

export const TemplateEnvContext = createContext<TemplateEnv | null>(null);

/** Marca <html data-template> del documento; devuelve la función que la quita. */
export function markTemplate(doc: Document, template: string): () => void {
  const root = doc.documentElement;
  root.dataset.template = template;
  return () => {
    delete root.dataset.template;
  };
}

/** Bloquea el scroll del documento (menú abierto); devuelve la función que lo restaura. */
export function lockBodyScroll(doc: Document): () => void {
  const { body } = doc;
  const prev = body.style.overflow;
  body.style.overflow = 'hidden';
  return () => {
    body.style.overflow = prev;
  };
}

export function useTemplateEnv(): TemplateEnv {
  const env = useContext(TemplateEnvContext) ?? DEFAULT_ENV;
  if (!env) throw new Error('Las plantillas necesitan un navegador (window/document).');
  return env;
}
