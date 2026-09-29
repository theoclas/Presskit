import type { ImageDto } from '@fersua/shared';
import { useEffect, useRef } from 'react';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';
import { closeDialog, openDialog } from './dialog';

interface Props {
  images: ImageDto[];
  index: number | null;
  altFallback: string;
  onClose: () => void;
  onIndex: (index: number) => void;
}

/** Visor simple con <dialog> nativo: Esc cierra, flechas cambian de foto, el foco vuelve al botón. */
export function Lightbox({ images, index, altFallback, onClose, onIndex }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null && index >= 0 && index < images.length;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) openDialog(d);
    else closeDialog(d);
  }, [open]);

  if (!images.length) return null;
  const current = open ? images[index] : undefined;
  const total = images.length;
  const go = (delta: number) => {
    if (index === null) return;
    onIndex((index + delta + total) % total);
  };

  return (
    <dialog
      ref={ref}
      className="dlg lightbox"
      aria-label="Visor de fotos"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
      }}
    >
      {current ? (
        <div className="dlg-inner">
          <div className="dlg-media">
            <ResponsiveImage
              image={current}
              sizes={IMAGE_SIZES.lightbox}
              alt={current.alt || `${altFallback} — foto ${(index ?? 0) + 1}`}
              priority
            />
          </div>
          <div className="dlg-actions">
            {total > 1 ? (
              <button type="button" className="btn btn-secondary" onClick={() => go(-1)} aria-label="Foto anterior">
                ‹
              </button>
            ) : null}
            {total > 1 ? (
              <span className="lightbox-count" aria-live="polite">
                {(index ?? 0) + 1} / {total}
              </span>
            ) : null}
            {total > 1 ? (
              <button type="button" className="btn btn-secondary" onClick={() => go(1)} aria-label="Foto siguiente">
                ›
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={() => ref.current && closeDialog(ref.current)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
