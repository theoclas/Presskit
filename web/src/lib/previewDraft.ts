import { resolveTexts, type PaletteKey, type PublicDjProfileDto, type TemplateKey, type TextGroup } from '@fersua/shared';

/**
 * Lo que el editor tiene sin guardar y la vista previa en vivo pinta encima de lo guardado:
 * nombre, ciudad, plantilla, paleta, fotos en blanco y negro y textos.
 */
export interface PreviewDraft {
  displayName: string;
  city: string | null;
  template: TemplateKey;
  palette: PaletteKey;
  monoPhotos: boolean;
  /** Los textos escritos (sin vacíos): lo que falte toma el valor por defecto, como en el api. */
  texts: Record<string, string>;
}

/** Solo los textos con contenido: un texto vacío vuelve al valor por defecto al guardar. */
export function filledTexts(texts: Record<string, string | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(texts ?? {})) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}

/** La página guardada con el borrador encima (lo mismo que armaría el api al guardar). */
export function applyDraft(dj: PublicDjProfileDto, draft: PreviewDraft | null): PublicDjProfileDto {
  if (!draft) return dj;
  const displayName = draft.displayName.trim() || dj.displayName;
  return {
    ...dj,
    displayName,
    city: draft.city?.trim() || null,
    template: draft.template,
    palette: draft.palette,
    monoPhotos: draft.monoPhotos,
    texts: resolveTexts(draft.texts, displayName),
  };
}

/** Dónde está cada grupo de textos en la página (el primero que exista en la plantilla). */
export const GROUP_TARGETS: Record<TextGroup, readonly string[]> = {
  nav: [],
  hero: ['#intro', 'header'],
  story: ['#story', '#bio'],
  media: ['#galeria', '#rider', '.hero-mini', '#media-module'],
  artists: ['#artistas'],
  events: ['#fechas'],
  booking: ['#booking'],
  footer: ['footer'],
};

/** Lleva la vista previa a la sección del grupo (arriba del todo para el menú). */
export function scrollToGroup(doc: Document, group: TextGroup): void {
  const win = doc.defaultView;
  const selectors = GROUP_TARGETS[group] ?? [];
  const el = selectors.map((s) => doc.querySelector(s)).find((x): x is Element => !!x);
  if (!el) {
    win?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
