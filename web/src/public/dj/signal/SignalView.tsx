import type { PublicDjProfileDto } from '@fersua/shared';
import { useRef } from 'react';
import { isWhatsappUrl } from '../../../lib/whatsapp';
import { ResponsiveImage } from '../../components/ResponsiveImage';
import { ArtistsSection } from '../ArtistsSection';
import { BookingSection } from '../BookingSection';
import { GalleryGrid } from '../GalleryGrid';
import { ShowsSection } from '../ShowsSection';
import { SocialLinks } from '../SocialLinks';
import { TemplateNav, type TemplateNavLink } from '../TemplateNav';
import { nameSize, useHeroScroll, useHtmlTemplate } from '../templateKit';
import '@fontsource/anton/400.css';
import './signal.css';

interface Props {
  dj: PublicDjProfileDto;
  /** 'preview': vista previa del editor (el formulario no se envía). */
  mode?: 'live' | 'preview';
}

function Arrow() {
  return (
    <svg className="sg-arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Pulse() {
  return (
    <svg className="sg-pulse" viewBox="0 0 40 16" aria-hidden="true" focusable="false">
      <path d="M0 8h9l3-6 4 12 4-10 3 6 2-2h15" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Plantilla «Signal» (concepto Afterhours): portada como cartel de festival, foto a pantalla
 * completa en blanco y negro y el nombre en letra condensada gigante. Lee el mismo contenido
 * que la clásica y reutiliza sus secciones de artistas, fechas y formulario (con su CSS .djp,
 * reajustado en signal.css). Pura como DjPublicView: props in, markup out.
 */
export function SignalView({ dj, mode = 'live' }: Props) {
  const { texts } = dj;
  const hasGallery = dj.show.gallery && dj.gallery.length > 0;
  const hasRider = dj.show.rider && dj.riderItems.length > 0;
  const hasArtists = dj.members.length > 0;
  const showEvents = dj.show.events;
  const showBooking = dj.show.form && dj.bookingForm.fields.length > 0;
  const hasStory = !!texts.heroSubtitle;
  const heroWa = isWhatsappUrl(dj.whatsapp.heroUrl) ? dj.whatsapp.heroUrl : null;
  const openDateUrl = dj.show.openDateRow && isWhatsappUrl(dj.whatsapp.openDateUrl) ? dj.whatsapp.openDateUrl : null;

  const eyebrow = [texts.heroLabel, dj.city].filter(Boolean).join(' / ');
  const ticker = [dj.city, ...dj.genres.map((g) => g.name)].filter((v): v is string => !!v);
  // La foto de la historia: una de la galería (la segunda, para no repetir la grande del
  // mosaico) o la de un integrante.
  const storyImage = (hasGallery ? (dj.gallery[1] ?? dj.gallery[0]) : null) ?? dj.members.find((m) => m.photo)?.photo ?? null;
  const riderTitle = texts.riderTitle || texts.riderButton;
  const galleryTitle = texts.galleryTitle || texts.galleryButton;

  // El CTA fijo del teléfono: el formulario si hay, si no WhatsApp.
  const stickyHref = showBooking ? '#booking' : heroWa;
  const stickyLabel = showBooking ? texts.heroSecondaryCta : texts.heroPrimaryCta;

  const navLinks: TemplateNavLink[] = [
    hasStory ? { href: '#story', label: texts.storyLabel } : null,
    hasArtists ? { href: '#artistas', label: texts.navArtists } : null,
    hasGallery ? { href: '#galeria', label: galleryTitle } : null,
    showEvents ? { href: '#fechas', label: texts.navEvents } : null,
  ].filter((l): l is TemplateNavLink => !!l && !!l.label);

  const heroRef = useRef<HTMLElement>(null);
  const { scrolled, stickyOn } = useHeroScroll(heroRef);
  useHtmlTemplate('SIGNAL');

  return (
    <div className={['djp djs', mode === 'preview' ? 'djs--preview' : '', dj.monoPhotos ? '' : 'djs--color'].filter(Boolean).join(' ')}>
      <TemplateNav
        prefix="sg"
        displayName={dj.displayName}
        links={navLinks}
        booking={showBooking ? { href: '#booking', label: texts.navBooking } : null}
        scrolled={scrolled}
      />
      <main id="main" tabIndex={-1}>
        <header ref={heroRef} className={dj.heroImage ? 'sg-hero' : 'sg-hero sg-hero--plain'} id="intro">
          {dj.heroImage ? (
            <div className="sg-hero-media">
              <ResponsiveImage
                image={dj.heroImage}
                // En vertical la foto horizontal se recorta para cubrir el alto: se ve ~3 veces más ancha.
                sizes="(orientation: portrait) 300vw, 100vw"
                alt={dj.heroImage.alt || texts.heroPhotoAlt || `Show de ${dj.displayName}`}
                priority
              />
            </div>
          ) : null}
          <div className="sg-hero-shade" aria-hidden="true" />
          {dj.heroImage ? <div className="sg-hero-frame" aria-hidden="true" /> : null}

          <div className="sg-wrap sg-hero-content">
            {eyebrow ? <p className="sg-eyebrow">{eyebrow}</p> : null}
            <h1 className={`sg-name sg-name--${nameSize(dj.displayName)}`}>{dj.displayName}</h1>
            {dj.genres.length ? (
              <p className="sg-genres">
                {dj.genres.map((g, i) => (
                  <span key={g.slug}>
                    {i > 0 ? <span aria-hidden="true"> / </span> : null}
                    {g.name}
                  </span>
                ))}
              </p>
            ) : null}

            {heroWa || showBooking ? (
              <div className="sg-cta">
                {heroWa ? (
                  <a className="sg-btn sg-btn--primary" href={heroWa} target="_blank" rel="noopener noreferrer">
                    {texts.heroPrimaryCta}
                    <Arrow />
                  </a>
                ) : null}
                {showBooking ? (
                  <a className={heroWa ? 'sg-btn sg-btn--ghost' : 'sg-btn sg-btn--primary'} href="#booking">
                    {texts.heroSecondaryCta}
                    <Arrow />
                  </a>
                ) : null}
              </div>
            ) : null}
            {texts.heroNote ? <p className="sg-note">{texts.heroNote}</p> : null}
            <SocialLinks links={dj.socials} className="sg-socials" ownerName={dj.displayName} />
          </div>

          {dj.heroImage && (texts.heroCaptionLeft || texts.heroCaptionRight) ? (
            <div className="sg-hero-caption" aria-hidden="true">
              <span>{texts.heroCaptionLeft}</span>
              <span>{texts.heroCaptionRight}</span>
            </div>
          ) : null}
        </header>

        {ticker.length ? (
          // Decorativa: la ciudad y los géneros ya están en la portada.
          <div className="sg-ticker" aria-hidden="true">
            <Pulse />
            <div className="sg-ticker-track">
              {[0, 1].map((copy) => (
                <div className="sg-ticker-run" key={copy}>
                  {[...ticker, ...ticker].map((item, i) => (
                    <span key={`${item}-${i}`}>
                      {item}
                      <i>·</i>
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <span className="sg-ticker-end">/////</span>
          </div>
        ) : null}

        {hasStory ? (
          <section className={storyImage ? 'sg-story' : 'sg-story sg-story--solo'} id="story" aria-labelledby="story-title">
            {storyImage ? (
              <div className="sg-story-media">
                <ResponsiveImage
                  image={storyImage}
                  sizes="(max-width: 900px) 100vw, 50vw"
                  alt={storyImage.alt || `${dj.displayName} en vivo`}
                />
              </div>
            ) : null}
            <div className="sg-story-body">
              {texts.storyLabel ? <p className="sg-kicker">{texts.storyLabel}</p> : null}
              <h2 className="sg-h2" id="story-title">
                {texts.heroTitle || dj.displayName}
              </h2>
              <p className="sg-story-text">{texts.heroSubtitle}</p>
              {hasArtists && texts.storyMoreCta ? (
                <a className="sg-link" href="#artistas">
                  {texts.storyMoreCta}
                  <Arrow />
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="sg-wrap sg-sections">
          {hasArtists ? <ArtistsSection texts={texts} members={dj.members} /> : null}

          {hasGallery ? (
            <section id="galeria" aria-labelledby="galeria-title">
              <h2 className="sec-title" id="galeria-title">
                {galleryTitle}
              </h2>
              <GalleryGrid images={dj.gallery} displayName={dj.displayName} />
            </section>
          ) : null}

          {hasRider || showEvents ? (
            <div className={hasRider && showEvents ? 'sg-pair' : 'sg-pair sg-pair--single'}>
              {showEvents ? <ShowsSection texts={texts} events={dj.events} openDateUrl={openDateUrl} /> : null}
              {hasRider ? (
                <section id="rider" aria-labelledby="rider-title">
                  <h2 className="sec-title" id="rider-title">
                    {riderTitle}
                  </h2>
                  <ol className="sg-rider">
                    {dj.riderItems.map((item, i) => (
                      <li key={`${item.name}-${i}`}>
                        <span className="sg-rider-n" aria-hidden="true">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span>
                          <b>{item.name}</b>
                          {item.note ? <span className="sg-rider-note">{item.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          ) : null}

          {showBooking ? <BookingSection dj={dj} preview={mode === 'preview'} /> : null}
        </div>
      </main>

      <footer className="sg-footer">
        <div className="sg-wrap">
          <p className="sg-footer-name" aria-hidden="true">
            {dj.displayName}
          </p>
          <SocialLinks links={dj.socials} className="sg-socials" ownerName={dj.displayName} />
          <p className="sg-footer-copy">
            © {new Date().getFullYear()} {texts.footerText || `${dj.displayName} — Booking`}
          </p>
        </div>
      </footer>

      {stickyHref && stickyLabel ? (
        <a
          className={stickyOn ? 'sg-sticky is-on' : 'sg-sticky'}
          href={stickyHref}
          aria-hidden={!stickyOn || undefined}
          tabIndex={stickyOn ? undefined : -1}
          target={showBooking ? undefined : '_blank'}
          rel={showBooking ? undefined : 'noopener noreferrer'}
        >
          {stickyLabel}
          <Arrow />
        </a>
      ) : null}
    </div>
  );
}
