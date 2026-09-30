import type { PublicEventDto } from '@fersua/shared';
import { useEffect, useRef } from 'react';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';
import { closeDialog, openDialog } from './dialog';
import { eventCtaHref, eventLongDate, eventPlace } from './eventCta';

interface Props {
  event: PublicEventDto | null;
  ctaLabel: string;
  onClose: () => void;
}

/** Reemplaza las páginas negras de Eventos/*.html: el flyer con su botón de reserva. */
export function FlyerDialog({ event, ctaLabel, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = !!event?.flyer;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) openDialog(d);
    else closeDialog(d);
  }, [open]);

  const href = event ? eventCtaHref(event.cta) : null;
  const label = event?.cta?.label?.trim() || ctaLabel;
  const place = event ? eventPlace(event) : '';

  return (
    <dialog
      ref={ref}
      className="dlg flyer-dialog"
      aria-label={event ? `Flyer: ${place}` : 'Flyer'}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog(e.currentTarget);
      }}
    >
      {event?.flyer ? (
        <div className="dlg-inner">
          <div className="dlg-media">
            <ResponsiveImage
              image={event.flyer}
              sizes={IMAGE_SIZES.flyer}
              alt={event.flyer.alt || `Flyer de ${place}`}
              priority
            />
          </div>
          <div className="dlg-meta">
            {eventLongDate(event)} · {place}
          </div>
          <div className="dlg-actions">
            {href ? (
              <a className="btn btn-primary" href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
                {label}
              </a>
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
