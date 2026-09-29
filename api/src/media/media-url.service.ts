import { Injectable } from '@nestjs/common';
import type { ImageDto, MediaAssetDto, MediaVariant } from '@fersua/shared';
import type { MediaAsset } from '@prisma/client';
import { hmacHex, safeEqual } from '../common/crypto';
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

/** Archivos que la vista previa firmada puede servir (las mismas formas que escribe el pipeline). */
export const PREVIEW_FILE_RE = /^(?:\d{1,5}\.webp|og\.jpg)$/;
/** Ids cuid de MediaAsset. */
export const ASSET_ID_RE = /^[a-z0-9]{20,32}$/;
/** Vida máxima de una URL firmada (segundos). */
export const PREVIEW_TTL_SECONDS = 3600;
/**
 * La expiración se redondea a bloques de 10 min: dentro de un bloque la URL es la misma y el
 * editor no ve cambiar el src de cada foto en cada recarga de datos. Vida real: 50-60 min.
 */
const PREVIEW_BUCKET_SECONDS = 600;
const EXP_RE = /^\d{9,11}$/;
const SIG_RE = /^[0-9a-f]{64}$/;

type AssetLike = Pick<MediaAsset, 'id' | 'storageKey' | 'variants' | 'width' | 'height' | 'hasOg' | 'isPublic'>;
type EditorAssetLike = AssetLike & Pick<MediaAsset, 'kind' | 'bytesTotal' | 'createdAt'>;

/** Lo mismo que ImageMapper de public.mappers (tipado estructural para no acoplar módulos). */
export interface PreviewImageMapper {
  toImageDto(asset: MediaAsset | null | undefined, alt?: string | null): ImageDto | null;
  ogUrl(asset: MediaAsset): string | null;
}

/**
 * Único lugar que arma URLs de imágenes. La web nunca construye rutas de /media: usa lo que
 * llega en ImageDto. Los assets públicos salen como /media/...; los privados (perfiles sin
 * aprobar) solo como URL firmada de /api/media/preview, y solo para el dueño o el admin.
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

  // ------------------------------------------------------------------ vista previa privada

  /**
   * Imagen para el editor y la vista previa: la pública tal cual; la privada con URLs firmadas.
   * Nunca usar en respuestas públicas: una URL firmada deja ver una foto sin aprobar.
   */
  toPreviewImageDto(asset: AssetLike | null | undefined, alt?: string | null, nowMs: number = Date.now()): ImageDto | null {
    if (!asset) return null;
    if (asset.isPublic) return this.toImageDto(asset, alt);
    if (!ASSET_ID_RE.test(asset.id)) return null;
    const variants: MediaVariant[] = parseVariants(asset.variants)
      .map((v) => ({ w: v.w, h: v.h, url: this.previewUrl(asset.id, v.file, nowMs) }))
      .sort((a, b) => a.w - b.w);
    if (!variants.length) return null;
    return {
      id: asset.id,
      width: asset.width,
      height: asset.height,
      alt: alt ?? null,
      variants,
      ogUrl: asset.hasOg ? this.previewUrl(asset.id, 'og.jpg', nowMs) : null,
    };
  }

  /** MediaAssetDto del panel (dueño/admin). */
  toEditorAssetDto(asset: EditorAssetLike | null | undefined, nowMs: number = Date.now()): MediaAssetDto | null {
    const img = this.toPreviewImageDto(asset, null, nowMs);
    if (!asset || !img) return null;
    return {
      ...img,
      kind: asset.kind,
      isPublic: asset.isPublic,
      bytesTotal: asset.bytesTotal,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  /** Mapper para reutilizar los mappers públicos en la vista previa (cualquier estado). */
  previewMapper(nowMs: number = Date.now()): PreviewImageMapper {
    return {
      toImageDto: (asset, alt) => this.toPreviewImageDto(asset, alt, nowMs),
      ogUrl: (asset) => (asset.isPublic ? this.ogUrl(asset) : asset.hasOg ? this.previewUrl(asset.id, 'og.jpg', nowMs) : null),
    };
  }

  /** URL relativa firmada: /api/media/preview/<assetId>/<file>?exp=&sig=. */
  previewUrl(assetId: string, file: string, nowMs: number = Date.now()): string {
    const exp = previewExpiry(nowMs);
    return `/api/media/preview/${assetId}/${file}?exp=${exp}&sig=${this.previewSig(assetId, file, exp)}`;
  }

  /** Firma válida, no vencida y con una vida que no pasa de 1 h. No toca la BD ni el disco. */
  verifyPreview(assetId: unknown, file: unknown, exp: unknown, sig: unknown, nowMs: number = Date.now()): boolean {
    if (typeof assetId !== 'string' || !ASSET_ID_RE.test(assetId)) return false;
    if (typeof file !== 'string' || !PREVIEW_FILE_RE.test(file)) return false;
    if (typeof exp !== 'string' || !EXP_RE.test(exp)) return false;
    if (typeof sig !== 'string' || !SIG_RE.test(sig)) return false;
    const expSeconds = Number(exp);
    const nowSeconds = nowMs / 1000;
    if (expSeconds <= nowSeconds || expSeconds - nowSeconds > PREVIEW_TTL_SECONDS) return false;
    return safeEqual(this.previewSig(assetId, file, expSeconds), sig);
  }

  private previewSig(assetId: string, file: string, exp: number): string {
    // Prefijo propio: el mismo secreto firma los tokens del formulario de booking y las dos
    // firmas nunca deben poder confundirse.
    return hmacHex(this.config.bookingFormSecret, `media-preview.v1|${assetId}|${file}|${exp}`);
  }
}

/** Expiración (segundos epoch) redondeada al bloque: entre 50 y 60 minutos desde ahora. */
export function previewExpiry(nowMs: number): number {
  const now = Math.floor(nowMs / 1000);
  return Math.floor(now / PREVIEW_BUCKET_SECONDS) * PREVIEW_BUCKET_SECONDS + PREVIEW_TTL_SECONDS;
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

/** Archivos que existen para un asset según su fila (variantes + og.jpg si lo tiene). */
export function assetFiles(asset: Pick<MediaAsset, 'variants' | 'hasOg'>): string[] {
  const files = parseVariants(asset.variants).map((v) => v.file);
  if (asset.hasOg) files.push('og.jpg');
  return files;
}
