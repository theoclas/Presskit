import type { PageTexts, PublicEventDto } from '@fersua/shared';
import { useState } from 'react';
import { EXTERNAL_REL } from '../../lib/safeUrl';
import { FlyerDialog } from './FlyerDialog';
import { ShowItem } from './ShowItem';

interface Props {
  texts: PageTexts;
  events: PublicEventDto[];
  /** URL wa.me de la fila "Disponible", ya validada; null si la fila no se muestra. */
  openDateUrl: string | null;
}

export function ShowsSection({ texts, events, openDateUrl }: Props) {
  const [flyerEvent, setFlyerEvent] = useState<PublicEventDto | null>(null);
  return (
    <section id="fechas" aria-labelledby="fechas-title">
      <h2 className="sec-title" id="fechas-title">
        {texts.eventsTitle}
      </h2>
      {texts.eventsSubtitle ? <div className="sec-sub">{texts.eventsSubtitle}</div> : null}

      {/* Con la fila "Disponible" ya se entiende que la agenda está abierta: el texto de vacío sobra. */}
      {events.length === 0 && !openDateUrl && texts.eventsEmpty ? <p className="shows-empty">{texts.eventsEmpty}</p> : null}
      {/* El wrapper .shows estaba comentado en la plantilla: aquí vuelve (gap de 8px). */}
      {events.length > 0 || openDateUrl ? (
        <div className="shows" role="list">
          {events.map((ev) => (
            <ShowItem key={ev.id} event={ev} ctaLabel={texts.eventCtaLabel} onOpenFlyer={setFlyerEvent} />
          ))}
          {openDateUrl ? (
            <div className="show-item show-item--open" role="listitem">
              <div className="show-date">{texts.openDateLabel}</div>
              <div className="show-place">{texts.openDateText}</div>
              <div className="show-cta">
                <a href={openDateUrl} target="_blank" rel={EXTERNAL_REL}>
                  {texts.openDateCta}
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {texts.eventsNote ? <p className="shows-note">{texts.eventsNote}</p> : null}
      <FlyerDialog event={flyerEvent} ctaLabel={texts.eventCtaLabel} onClose={() => setFlyerEvent(null)} />
    </section>
  );
}
