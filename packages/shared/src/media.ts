import type { MediaKind } from './enums';
import { LIMITS } from './limits';

// Variantes que genera el api al subir una imagen. Nunca se agranda una imagen:
// se omiten los anchos mayores que el original.
export interface VariantSpec {
  widths: readonly number[];
  fit: 'inside' | 'cover';
  aspect?: readonly [number, number];
  quality: number;
}

export const MEDIA_VARIANTS: Record<MediaKind, VariantSpec> = {
  HERO: { widths: [480, 960, 1440], fit: 'inside', quality: 80 },
  CARD: { widths: [400, 800], fit: 'cover', aspect: [4, 5], quality: 78 },
  MEMBER: { widths: [240, 480], fit: 'inside', quality: 80 },
  GALLERY: { widths: [480, 960, 1600], fit: 'inside', quality: 80 },
  FLYER: { widths: [540, 1080], fit: 'inside', quality: 82 },
};

/** Imagen para vistas previas de enlaces (WhatsApp/Instagram): se deriva del HERO. */
export const OG_IMAGE = { width: 1200, height: 630, quality: 80 } as const;

export const MEDIA_KIND_MAX: Record<MediaKind, number> = {
  HERO: 1,
  CARD: 1,
  MEMBER: LIMITS.members.max,
  GALLERY: LIMITS.gallery.max,
  FLYER: LIMITS.events.storedMax,
};

export interface MediaVariant {
  w: number;
  h: number;
  url: string;
}

/** Forma pública de una imagen: la construye el api, la web solo la pinta. */
export interface ImageDto {
  id: string;
  width: number;
  height: number;
  alt?: string | null;
  variants: MediaVariant[];
  ogUrl?: string | null;
}

export function srcSetOf(img: Pick<ImageDto, 'variants'>): string {
  return img.variants.map((v) => `${v.url} ${v.w}w`).join(', ');
}

export function largestVariant(img: Pick<ImageDto, 'variants'>): MediaVariant | undefined {
  return img.variants.reduce<MediaVariant | undefined>((best, v) => (!best || v.w > best.w ? v : best), undefined);
}
