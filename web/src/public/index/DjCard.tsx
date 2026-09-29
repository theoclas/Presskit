import { PALETTES, formatLongDate, formatShowDate, type PublicDjCardDto } from '@fersua/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';

interface Props {
  card: PublicDjCardDto;
  onPrefetch?: (slug: string) => void;
}

const MAX_GENRES = 3;

export function DjCard({ card, onPrefetch }: Props) {
  const extra = card.genres.length - MAX_GENRES;
  // Cada tarjeta brilla con el acento de la paleta del DJ al pasar el mouse.
  const style = { '--card-accent-rgb': (PALETTES[card.palette] ?? PALETTES.SUNSET).accentRgb } as CSSProperties;
  const prefetch = onPrefetch ? () => onPrefetch(card.slug) : undefined;
  return (
    <Link
      to={`/${card.slug}`}
      className="dj-card"
      style={style}
      onPointerEnter={prefetch}
      onTouchStart={prefetch}
      onFocus={prefetch}
    >
      <div className={card.cardImage ? 'dj-card-photo' : 'dj-card-photo dj-card-photo--empty'}>
        {card.cardImage ? (
          <ResponsiveImage image={card.cardImage} sizes={IMAGE_SIZES.card} alt={card.cardImage.alt || card.displayName} />
        ) : null}
        {card.featured ? <span className="nav-tag dj-card-badge">Destacado</span> : null}
      </div>
      <div className="dj-card-body">
        <h3 className="dj-card-name">{card.displayName}</h3>
        {card.tagline ? <p className="dj-card-tagline">{card.tagline}</p> : null}
        {card.genres.length ? (
          <div className="dj-card-genres">
            {card.genres.slice(0, MAX_GENRES).map((g) => (
              <span className="chip" key={g.slug}>
                {g.name}
              </span>
            ))}
            {extra > 0 ? <span className="chip">+{extra}</span> : null}
          </div>
        ) : null}
        <div className="show-item dj-card-next">
          {card.nextEvent ? (
            <>
              <span className="show-date">Próxima fecha</span>
              <span>
                <span aria-hidden="true">{card.nextEvent.dateLabel || formatShowDate(card.nextEvent.date)}</span>
                <span className="visually-hidden">{formatLongDate(card.nextEvent.date)}</span>
                <span className="show-place"> · {card.nextEvent.venue}</span>
              </span>
            </>
          ) : (
            <span className="show-place">Agenda abierta</span>
          )}
        </div>
      </div>
    </Link>
  );
}
