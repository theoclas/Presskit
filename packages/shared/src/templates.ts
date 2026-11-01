import type { PaletteKey, TemplateKey } from './enums';

// Plantillas visuales de la página pública. Todas leen el mismo contenido del perfil:
// cambiar de plantilla no borra nada, solo cambia cómo se pinta.
export interface Template {
  name: string;
  description: string;
  /** La paleta con la que se diseñó; el editor la sugiere al elegir la plantilla. */
  suggestedPalette: PaletteKey;
}

export const DEFAULT_TEMPLATE: TemplateKey = 'CLASSIC';

export const TEMPLATES: Record<TemplateKey, Template> = {
  CLASSIC: {
    name: 'Clásica',
    description: 'La página original de Mac Fly & Mike Bran: tarjetas redondeadas y portada con foto al lado.',
    suggestedPalette: 'SUNSET',
  },
  SIGNAL: {
    name: 'Signal',
    description: 'Estilo cartel de festival: foto a pantalla completa en blanco y negro y el nombre en letra gigante.',
    suggestedPalette: 'SIGNAL',
  },
  GROOVE: {
    name: 'Neon Groove',
    description: 'Cinematográfica y a color: foto con luz de neón, nombre en cursiva ancha y tarjetas con brillo.',
    suggestedPalette: 'GROOVE',
  },
  NOIR: {
    name: 'Editorial Noir',
    description: 'Estilo revista de moda: fondo marfil, letra serif elegante y bloques borgoña y dorado.',
    suggestedPalette: 'NOIR',
  },
  HYPERWAVE: {
    name: 'Hyperwave',
    description: 'Futurista en mosaico: toda la página en tarjetas de vidrio con brillo azul y el nombre en cromo.',
    suggestedPalette: 'HYPERWAVE',
  },
};
