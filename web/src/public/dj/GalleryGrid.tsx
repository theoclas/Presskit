import type { ImageDto } from '@fersua/shared';
import { useState } from 'react';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';
import { Lightbox } from './Lightbox';

interface Props {
  images: ImageDto[];
  displayName: string;
}

export function GalleryGrid({ images, displayName }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const total = images.length;
  return (
    <>
      <div className="media-grid">
        {images.map((img, i) => (
          <figure className="media-item" key={img.id}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Ver foto ${i + 1} de ${total}`}>
              <ResponsiveImage image={img} sizes={IMAGE_SIZES.gallery} alt={img.alt || `${displayName} — foto ${i + 1}`} />
            </button>
          </figure>
        ))}
      </div>
      <Lightbox images={images} index={open} altFallback={displayName} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}
