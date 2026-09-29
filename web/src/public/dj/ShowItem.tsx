import type { PublicEventDto } from '@fersua/shared';
import { EXTERNAL_REL } from '../../lib/safeUrl';
import { eventCtaHref, eventLongDate, eventPlace, eventShortDate } from './eventCta';

interface Props {
  event: PublicEventDto;
  ctaLabel: string;
  onOpenFlyer?: (event: PublicEventDto) => void;
}

/**
 * Una fecha. Si tiene flyer, "Book" abre el flyer (como las páginas viejas de Eventos/);
 * si no, el enlace va directo al CTA que armó el servidor.
 */
export function ShowItem({ event, ctaLabel, onOpenFlyer }: Props) {
  const href = eventCtaHref(event.cta);
  const label = event.cta?.label?.trim() || ctaLabel;
  return (
    <div className="show-item" role="listitem">
      <div className="show-date">
        <span aria-hidden="true">{eventShortDate(event)}</span>
        <span className="visually-hidden">{eventLongDate(event)}</span>
      </div>
      <div className="show-place">{eventPlace(event)}</div>
      <div className="show-cta">
        {event.flyer && onOpenFlyer ? (
          <button type="button" onClick={() => onOpenFlyer(event)} aria-haspopup="dialog">
            {label}
          </button>
        ) : href ? (
          <a href={href} target="_blank" rel={EXTERNAL_REL}>
            {label}
          </a>
        ) : null}
      </div>
    </div>
  );
}
