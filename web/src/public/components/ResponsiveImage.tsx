import type { ImageDto } from '@fersua/shared';
import type { CSSProperties } from 'react';
import { safeImageUrl } from '../../lib/safeUrl';

/** `sizes` por uso: dicen al navegador qué variante bajar según el ancho real en pantalla. */
export const IMAGE_SIZES = {
  hero: '(max-width: 960px) calc(100vw - 64px), 440px',
  member: '(max-width: 640px) 100px, 115px',
  gallery: '(max-width: 640px) 50vw, 360px',
  card: '(max-width: 560px) 100vw, 280px',
  flyer: 'min(92vw, 720px)',
  lightbox: '92vw',
} as const;

interface Props {
  image: ImageDto;
  sizes: string;
  alt?: string | null;
  /** Solo la imagen principal (LCP): eager + fetchpriority alta. */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ResponsiveImage({ image, sizes, alt, priority = false, className, style }: Props) {
  const variants = image.variants
    .map((v) => ({ ...v, url: safeImageUrl(v.url) }))
    .filter((v): v is typeof v & { url: string } => !!v.url && v.w > 0)
    .sort((a, b) => a.w - b.w);
  if (!variants.length) return null;

  // src de respaldo: la primera variante de 480 px o más (o la más grande que haya).
  const fallback = variants.find((v) => v.w >= 480) ?? variants[variants.length - 1]!;
  return (
    <img
      src={fallback.url}
      srcSet={variants.map((v) => `${v.url} ${v.w}w`).join(', ')}
      sizes={sizes}
      width={image.width || fallback.w}
      height={image.height || fallback.h}
      alt={alt ?? image.alt ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
      style={style}
    />
  );
}
