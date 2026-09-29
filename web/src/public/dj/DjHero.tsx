import type { GenreDto, ImageDto, PageTexts, SocialLinkDto } from '@fersua/shared';
import type { ReactNode } from 'react';
import { HeroPhoto } from './HeroPhoto';
import { SocialLinks } from './SocialLinks';

interface Props {
  displayName: string;
  texts: PageTexts;
  genres: GenreDto[];
  socials: SocialLinkDto[];
  heroImage: ImageDto | null;
  /** URL wa.me ya validada del botón principal. */
  heroWhatsappUrl: string | null;
  showBookingLink: boolean;
  /** Las tarjetitas de rider/fotos (o null si no hay ninguna). */
  miniCards: ReactNode | null;
}

export function DjHero({
  displayName,
  texts,
  genres,
  socials,
  heroImage,
  heroWhatsappUrl,
  showBookingLink,
  miniCards,
}: Props) {
  const hasRight = !!heroImage || !!miniCards;
  const single = !(heroImage && miniCards);
  return (
    <header className={hasRight ? 'hero' : 'hero hero--solo'}>
      <div className="hero-left">
        {texts.heroLabel ? <div className="hero-label">{texts.heroLabel}</div> : null}
        <h1 className="hero-title">{texts.heroTitle || displayName}</h1>
        {texts.heroSubtitle ? <p className="hero-sub">{texts.heroSubtitle}</p> : null}

        {genres.length ? (
          <div className="hero-genres">
            {genres.map((g) => (
              <span className="chip" key={g.slug}>
                {g.name}
              </span>
            ))}
          </div>
        ) : null}

        {heroWhatsappUrl || showBookingLink ? (
          <div className="hero-cta">
            {heroWhatsappUrl ? (
              <a className="btn btn-primary" href={heroWhatsappUrl} target="_blank" rel="noopener noreferrer">
                {texts.heroPrimaryCta}
              </a>
            ) : null}
            {showBookingLink ? (
              <a className="btn btn-secondary" href="#booking">
                {texts.heroSecondaryCta}
              </a>
            ) : null}
          </div>
        ) : null}

        {texts.heroNote ? <div className="hero-note">{texts.heroNote}</div> : null}
        <SocialLinks links={socials} className="hero-socials" ownerName={displayName} />
      </div>

      {hasRight ? (
        <div className={single ? 'hero-right hero-right--single' : 'hero-right'}>
          {heroImage ? (
            <HeroPhoto
              image={heroImage}
              alt={texts.heroPhotoAlt || `Show de ${displayName}`}
              captionLeft={texts.heroCaptionLeft}
              captionRight={texts.heroCaptionRight}
            />
          ) : null}
          {miniCards}
        </div>
      ) : null}
    </header>
  );
}
