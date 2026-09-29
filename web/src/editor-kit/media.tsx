import type { ImageDto, MediaUsageDto } from '@fersua/shared';
import { Progress, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { safeImageUrl } from '../lib/safeUrl';

// URLs de imágenes en el editor: las públicas (/media/...) y las firmadas de un perfil sin
// aprobar (/api/media/preview/<id>/<archivo>?exp=&sig=). Nunca se arman aquí: vienen del api.
// safeImageUrl acepta las dos (la vista previa /_preview usa la misma regla).
export function editorImageUrl(url: unknown): string | null {
  return safeImageUrl(url);
}

/** Variante más cercana (por arriba) al ancho pedido. */
export function thumbUrl(image: Pick<ImageDto, 'variants'> | null | undefined, width = 480): string | null {
  if (!image) return null;
  const variants = image.variants
    .map((v) => ({ w: v.w, url: editorImageUrl(v.url) }))
    .filter((v): v is { w: number; url: string } => !!v.url)
    .sort((a, b) => a.w - b.w);
  if (!variants.length) return null;
  return (variants.find((v) => v.w >= width) ?? variants[variants.length - 1]!).url;
}

interface ThumbProps {
  image: ImageDto | null | undefined;
  alt?: string;
  width?: number | string;
  aspect?: string;
  fit?: 'cover' | 'contain';
  style?: CSSProperties;
}

export function ImageThumb({ image, alt = '', width = 160, aspect = '4 / 3', fit = 'cover', style }: ThumbProps) {
  const src = thumbUrl(image, typeof width === 'number' ? width * 2 : 480);
  const box: CSSProperties = {
    width,
    aspectRatio: aspect,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'rgba(148,163,184,.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...style,
  };
  return (
    <div style={box}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: fit }} />
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }} aria-label="Sin foto">
          {typeof width === 'number' && width < 64 ? '—' : 'Sin foto'}
        </Typography.Text>
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Espacio usado del perfil (cuota del api). */
export function MediaUsage({ usage }: { usage: MediaUsageDto | null | undefined }) {
  if (!usage || !usage.maxBytes || !usage.maxAssets) return null;
  const pct = Math.min(100, Math.round(Math.max(usage.bytes / usage.maxBytes, usage.assets / usage.maxAssets) * 100));
  return (
    <div style={{ maxWidth: 360 }} aria-label="Espacio de fotos usado">
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Espacio usado: {formatBytes(usage.bytes)} de {formatBytes(usage.maxBytes)} · {usage.assets} de {usage.maxAssets} fotos
      </Typography.Text>
      <Progress percent={pct} size="small" showInfo={false} status={pct >= 90 ? 'exception' : 'normal'} />
    </div>
  );
}
