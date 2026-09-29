import { Injectable, Logger } from '@nestjs/common';
import { LIMITS, MEDIA_VARIANTS, OG_IMAGE, type MediaKind, type VariantSpec } from '@fersua/shared';
import sharp, { type Sharp, type SharpOptions } from 'sharp';
import { AppError } from '../common/errors';
import { MIME_BY_TYPE, sniffImageType, type SniffedImageType } from './magic-bytes';
import { MediaErrors } from './media.errors';
import { ProcessingQueue } from './processing-queue';

export interface ProcessedFile {
  /** Nombre dentro de la carpeta del asset: "480.webp" u "og.jpg". */
  file: string;
  w: number;
  h: number;
  data: Buffer;
}

export interface ProcessedImage {
  format: SniffedImageType;
  mime: string;
  /** Dimensiones del original ya orientado (EXIF aplicado). */
  sourceWidth: number;
  sourceHeight: number;
  /** Variantes WebP, de menor a mayor ancho. */
  variants: ProcessedFile[];
  /** JPEG 1200x630 para vistas previas de enlaces (solo HERO). */
  og: ProcessedFile | null;
}

const TIMEOUT_SECONDS = 20;
const QUEUE_CONCURRENCY = 1;
const QUEUE_MAX_WAITING = 3;

/**
 * Opciones de entrada para TODO archivo que venga de afuera. Nunca `unlimited: true`.
 * `pages: 1` + `animated: false`: de un GIF/WebP animado solo se lee el primer cuadro.
 */
export const SAFE_INPUT: SharpOptions = {
  limitInputPixels: LIMITS.upload.maxInputPixels,
  failOn: 'error',
  animated: false,
  pages: 1,
};

/**
 * Convierte una imagen subida en variantes WebP sin metadatos (EXIF/GPS/XMP/ICC fuera).
 * No escribe en disco: devuelve buffers para que StorageService los guarde de forma atómica.
 */
@Injectable()
export class ImagePipelineService {
  private readonly logger = new Logger(ImagePipelineService.name);
  private readonly queue = new ProcessingQueue(QUEUE_CONCURRENCY, QUEUE_MAX_WAITING, MediaErrors.busy);

  constructor() {
    // Sin caché de libvips y un solo hilo: memoria predecible en un VPS pequeño.
    sharp.cache(false);
    sharp.concurrency(1);
  }

  process(buffer: Buffer, kind: MediaKind): Promise<ProcessedImage> {
    return this.queue.run(() => this.processNow(buffer, kind));
  }

  private async processNow(buffer: Buffer, kind: MediaKind): Promise<ProcessedImage> {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw MediaErrors.unsupported();
    if (buffer.length > LIMITS.upload.maxBytes) throw MediaErrors.tooLarge();

    const format = sniffImageType(buffer);
    if (!format) throw MediaErrors.unsupported();

    const meta = await this.guard(() => sharp(buffer, SAFE_INPUT).metadata());
    // El decodificador que eligió sharp debe coincidir con los magic bytes: descarta políglotas.
    if (meta.format !== format) throw MediaErrors.unsupported();
    if (!meta.width || !meta.height) throw MediaErrors.invalid();
    if (meta.width * meta.height > LIMITS.upload.maxInputPixels) throw MediaErrors.tooLarge();

    // Dimensiones tras aplicar la orientación EXIF (una foto vertical de iPhone viene "acostada").
    const oriented = meta.autoOrient ?? { width: meta.width, height: meta.height };
    const srcW = oriented.width;
    const srcH = oriented.height;
    if (Math.min(srcW, srcH) < LIMITS.upload.minSidePx) throw MediaErrors.tooSmall(LIMITS.upload.minSidePx);

    const deadline = Date.now() + TIMEOUT_SECONDS * 1000;
    const spec = MEDIA_VARIANTS[kind];
    const variants: ProcessedFile[] = [];
    for (const target of planVariants(spec, srcW, srcH)) {
      variants.push(await this.renderVariant(buffer, spec, target, deadline));
    }

    let og: ProcessedFile | null = null;
    if (kind === 'HERO') og = await this.renderOg(buffer, deadline);

    return { format, mime: MIME_BY_TYPE[format], sourceWidth: srcW, sourceHeight: srcH, variants, og };
  }

  private async renderVariant(
    buffer: Buffer,
    spec: VariantSpec,
    target: { width: number; height?: number },
    deadline: number,
  ): Promise<ProcessedFile> {
    const { data, info } = await this.guard(() => {
      const img = this.base(buffer, deadline);
      if (spec.fit === 'cover' && target.height) {
        img.resize({
          width: target.width,
          height: target.height,
          fit: 'cover',
          // Recorte centrado: predecible para el DJ. 'attention' se iba a la zona más brillante
          // (humo y luces del show) y partía el cartel y la cabina de la foto de Mac Fly.
          position: 'centre',
          withoutEnlargement: true,
        });
      } else {
        img.resize({ width: target.width, fit: 'inside', withoutEnlargement: true });
      }
      return img.webp({ quality: spec.quality, effort: 4 }).toBuffer({ resolveWithObject: true });
    });
    return { file: `${info.width}.webp`, w: info.width, h: info.height, data };
  }

  private async renderOg(buffer: Buffer, deadline: number): Promise<ProcessedFile> {
    // Siempre 1200x630 exactos (aunque haya que ampliar): WhatsApp y los crawlers confían
    // en og:image:width/height. Fondo negro si la foto trae transparencia (JPEG no la soporta).
    const { data, info } = await this.guard(() =>
      this.base(buffer, deadline)
        .resize({ width: OG_IMAGE.width, height: OG_IMAGE.height, fit: 'cover', position: 'attention' })
        .flatten({ background: '#000000' })
        .jpeg({ quality: OG_IMAGE.quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true }),
    );
    return { file: 'og.jpg', w: info.width, h: info.height, data };
  }

  /** Decodificación segura + orientación. Sin withMetadata(): la salida no lleva metadatos. */
  private base(buffer: Buffer, deadline: number): Sharp {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    if (remaining <= 0) throw MediaErrors.timeout();
    return sharp(buffer, SAFE_INPUT).timeout({ seconds: remaining }).rotate();
  }

  /** Traduce los errores de sharp/libvips a errores estables sin filtrar detalles internos. */
  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/pixel limit/i.test(msg)) throw MediaErrors.tooLarge();
      if (/timeout/i.test(msg)) throw MediaErrors.timeout();
      this.logger.warn(`Imagen rechazada por el decodificador: ${msg.replace(/\s+/g, ' ').slice(0, 160)}`);
      throw MediaErrors.invalid();
    }
  }
}

/**
 * Anchos a generar. Nunca se agranda: se omiten los anchos mayores que el original. Si se
 * omitió alguno y el original es bastante más ancho que la última variante (p. ej. un flyer
 * de 899 px, que solo dejaría la de 540), se agrega una variante al ancho del original para
 * no servir una imagen borrosa en pantallas retina. CARD recorta a 4:5 dentro del original.
 */
export function planVariants(spec: VariantSpec, srcW: number, srcH: number): { width: number; height?: number }[] {
  const pick = (maxW: number): number[] => {
    const kept = spec.widths.filter((w) => w <= maxW);
    const largest = kept[kept.length - 1];
    const skipped = kept.length < spec.widths.length;
    if (largest === undefined || (skipped && maxW >= largest * 1.2)) kept.push(maxW);
    return kept;
  };
  if (spec.fit === 'cover' && spec.aspect) {
    const [aw, ah] = spec.aspect;
    // El recuadro 4:5 más grande que cabe dentro del original.
    const maxW = Math.max(1, Math.min(srcW, Math.floor((srcH * aw) / ah)));
    return pick(maxW).map((w) => ({ width: w, height: Math.round((w * ah) / aw) }));
  }
  return pick(srcW).map((w) => ({ width: w }));
}
