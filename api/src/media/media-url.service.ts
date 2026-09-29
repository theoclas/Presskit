import { Injectable } from '@nestjs/common';
import type { ImageDto, MediaVariant } from '@fersua/shared';
import type { MediaAsset } from '@prisma/client';
import { AppConfig } from '../config/app-config.service';
import { STORAGE_KEY_RE } from './storage.service';

/** Forma guardada en MediaAsset.variants. */
export interface StoredVariant {
  w: number;
  h: number;
  bytes: number;
  file: string;
}

const VARIANT_FILE_RE = /^\d{1,5}\.webp$/;

type AssetLike = Pick<MediaAsset, 'id' | 'storageKey' | 'variants' | 'width' | 'height' | 'hasOg' | 'isPublic'>;

/**
 * Único lugar que arma URLs de imágenes. La web nunca construye rutas de /media: usa lo que
 * llega en ImageDto. Solo emite URLs de assets públicos (los privados necesitan URL firmada, M3).
 */
@Injectable()
export class MediaUrlService {
  constructor(private readonly config: AppConfig) {}

  toImageDto(asset: AssetLike | null | undefined, alt?: string | null): ImageDto | null {
    if (!asset || !asset.isPublic || !STORAGE_KEY_RE.test(asset.storageKey)) return null;
    const variants: MediaVariant[] = parseVariants(asset.variants)
      .map((v) => ({ w: v.w, h: v.h, url: `/media/${asset.storageKey}/${v.file}` }))
      .sort((a, b) => a.w - b.w);
    if (!variants.length) return null;
    return {
      id: asset.id,
      width: asset.width,
      height: asset.height,
      alt: alt ?? null,
      variants,
      ogUrl: this.ogUrl(asset),
    };
  }

  /** URL absoluta del JPEG 1200x630 (og:image). Absoluta porque WhatsApp no resuelve relativas. */
  ogUrl(asset: AssetLike | null | undefined): string | null {
    if (!asset || !asset.hasOg || !asset.isPublic || !STORAGE_KEY_RE.test(asset.storageKey)) return null;
    return `${this.config.publicUrl}/media/${asset.storageKey}/og.jpg`;
  }
}

/** Lee el JSON guardado de forma defensiva: una fila rara no debe producir una URL rara. */
export function parseVariants(raw: unknown): StoredVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredVariant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    if (typeof v.file !== 'string' || !VARIANT_FILE_RE.test(v.file)) continue;
    if (!Number.isInteger(v.w) || !Number.isInteger(v.h)) continue;
    out.push({ w: v.w as number, h: v.h as number, bytes: Number(v.bytes) || 0, file: v.file });
  }
  return out;
}
