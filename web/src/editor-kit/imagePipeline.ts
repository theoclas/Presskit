import { LIMITS } from '@fersua/shared';

// Preparación de fotos en el navegador antes de subirlas. El api vuelve a validar todo
// (magic bytes, tamaño, píxeles); esto solo evita subir 30 MB desde un celular para nada.

const MB = 1024 * 1024;

/** Tope del archivo original que aceptamos antes de optimizar. */
export const RAW_MAX_BYTES = 40 * MB;
/** Por encima de esto se re-codifica aunque las dimensiones ya estén bien. */
export const REENCODE_OVER_BYTES = 4 * MB;
export const JPEG_QUALITY = 0.9;

export type ImageCheckError = 'HEIC' | 'TYPE' | 'TOO_LARGE_RAW' | 'EMPTY' | 'TOO_HEAVY';

export const IMAGE_CHECK_MESSAGES: Record<ImageCheckError, string> = {
  HEIC: 'Esa foto está en formato HEIC (iPhone). Exporta la foto como JPG e intenta de nuevo.',
  TYPE: 'Formato no permitido. Sube una foto JPG, PNG o WebP.',
  TOO_LARGE_RAW: 'La foto pesa más de 40 MB. Redúcela e intenta de nuevo.',
  EMPTY: 'El archivo está vacío.',
  TOO_HEAVY: 'La imagen es muy pesada; redúcela e intenta de nuevo.',
};

export class ImageCheckFailure extends Error {
  constructor(readonly reason: ImageCheckError) {
    super(IMAGE_CHECK_MESSAGES[reason]);
    this.name = 'ImageCheckFailure';
  }
}

const ALLOWED = LIMITS.upload.allowedMimes as readonly string[];
const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

interface FileLike {
  name: string;
  type: string;
  size: number;
}

/** Revisión sin leer el archivo: tipo declarado, extensión y tamaño. */
export function precheckImage(file: FileLike): ImageCheckError | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (HEIC_TYPES.includes(type) || /\.(heic|heif)$/.test(name)) return 'HEIC';
  // Algunos navegadores dejan el tipo vacío: en ese caso decide la extensión.
  if (type ? !ALLOWED.includes(type) : !/\.(jpe?g|png|webp)$/.test(name)) return 'TYPE';
  if (file.size <= 0) return 'EMPTY';
  if (file.size > RAW_MAX_BYTES) return 'TOO_LARGE_RAW';
  return null;
}

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'heic' | null;

/** Tipo real según los primeros 12 bytes (un .jpg renombrado desde HEIC no engaña). */
export function sniffImageType(b: Uint8Array): SniffedType {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(ascii(8, 12))) {
    return 'heic';
  }
  return null;
}

async function readHead(file: Blob, n: number): Promise<Uint8Array> {
  const part = file.slice(0, n);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(part);
  });
}

/** Revisión completa: la rápida + los magic bytes. Lanza ImageCheckFailure. */
export async function validateImageFile(file: File): Promise<void> {
  const quick = precheckImage(file);
  if (quick) throw new ImageCheckFailure(quick);
  const kind = sniffImageType(await readHead(file, 12));
  if (kind === 'heic') throw new ImageCheckFailure('HEIC');
  if (!kind) throw new ImageCheckFailure('TYPE');
}

/** Dimensiones de salida sin agrandar nunca y con el lado largo dentro del tope. */
export function fitWithin(width: number, height: number, maxLongEdge: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxLongEdge || long <= 0) return { width, height };
  const scale = maxLongEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    // from-image aplica la rotación EXIF (fotos de celular en vertical).
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').slice(0, 80) || 'foto';
  return `${base}.jpg`;
}

export interface PreparedImage {
  file: File;
  /** true si se re-codificó (se redujo o se quitaron metadatos). */
  optimized: boolean;
  width: number | null;
  height: number | null;
}

/**
 * Reduce a LIMITS.upload.clientMaxLongEdgePx y re-codifica a JPEG 0.9 cuando la foto es más
 * grande o pesa más de 4 MB. JPEG porque Safari no codifica WebP. Re-codificar también quita
 * EXIF/GPS (el servidor los quita otra vez). Si el navegador no puede decodificar la foto, se
 * sube la original si pesa hasta 10 MB.
 */
export async function prepareImage(file: File, maxLongEdge: number = LIMITS.upload.clientMaxLongEdgePx): Promise<PreparedImage> {
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    if (file.size <= LIMITS.upload.maxBytes) return { file, optimized: false, width: null, height: null };
    throw new ImageCheckFailure('TOO_HEAVY');
  }
  try {
    const { width, height } = decoded;
    const target = fitWithin(width, height, maxLongEdge);
    const needsResize = target.width !== width || target.height !== height;
    if (!needsResize && file.size <= REENCODE_OVER_BYTES) return { file, optimized: false, width, height };

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    // Las transparencias de un PNG quedarían negras en JPEG: fondo oscuro como la plantilla.
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, target.width, target.height);

    let blob = await toJpeg(canvas, JPEG_QUALITY);
    if (blob && blob.size > LIMITS.upload.maxBytes) blob = await toJpeg(canvas, 0.8);
    if (!blob || blob.size > LIMITS.upload.maxBytes) {
      if (file.size <= LIMITS.upload.maxBytes) return { file, optimized: false, width, height };
      throw new ImageCheckFailure('TOO_HEAVY');
    }
    const out = new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
    return { file: out, optimized: true, width: target.width, height: target.height };
  } catch (e) {
    if (e instanceof ImageCheckFailure) throw e;
    if (file.size <= LIMITS.upload.maxBytes) return { file, optimized: false, width: null, height: null };
    throw new ImageCheckFailure('TOO_HEAVY');
  } finally {
    decoded.close();
  }
}
