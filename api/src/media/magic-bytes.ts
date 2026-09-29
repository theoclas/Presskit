// Detección del formato real por los primeros bytes. No se confía en la extensión ni en el
// Content-Type que manda el navegador: los dos los controla quien sube el archivo.
// Solo se aceptan JPEG, PNG y WebP. SVG (puede llevar scripts), HEIC, AVIF, GIF, TIFF, PDF
// y cualquier otra cosa quedan fuera.

export type SniffedImageType = 'jpeg' | 'png' | 'webp';

export const MIME_BY_TYPE: Record<SniffedImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, offset: number, length: number): string {
  if (buf.length < offset + length) return '';
  return buf.toString('latin1', offset, offset + length);
}

export function sniffImageType(buf: Buffer): SniffedImageType | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // JPEG: SOI (FF D8) seguido de un marcador (FF).
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, PNG_SIGNATURE)) return 'png';
  // WebP: contenedor RIFF cuyo tipo es "WEBP" y cuyo primer chunk es VP8/VP8L/VP8X.
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    const chunk = ascii(buf, 12, 4);
    if (chunk === 'VP8 ' || chunk === 'VP8L' || chunk === 'VP8X') return 'webp';
  }
  return null;
}
