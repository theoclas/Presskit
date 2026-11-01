import { SOCIAL_PLATFORMS, type PublicDjProfileDto, type SocialLinkDto, type SocialPlatform } from '@fersua/shared';
import { useRef, useState, type ReactNode } from 'react';
import { safeHttpsUrl } from '../../../lib/safeUrl';
import { isWhatsappUrl } from '../../../lib/whatsapp';
import { ResponsiveImage } from '../../components/ResponsiveImage';
import { SocialIcon } from '../../components/SocialIcon';
import { ArtistsSection } from '../ArtistsSection';
import { BookingSection } from '../BookingSection';
import { GalleryGrid } from '../GalleryGrid';
import { ShowsSection } from '../ShowsSection';
import { SocialLinks } from '../SocialLinks';
import { TemplateNav, type TemplateNavLink } from '../TemplateNav';
import { nameSize, useHeroScroll, useHtmlTemplate } from '../templateKit';
import '@fontsource-variable/archivo/wdth-italic.css';
import '@fontsource-variable/archivo/wdth.css';
import './groove.css';

interface Props {
  dj: PublicDjProfileDto;
  /** 'preview': vista previa del editor (el formulario no se envía). */
  mode?: 'live' | 'preview';
}

/** Dónde se escucha al DJ, en este orden de preferencia (el botón «Escuchar ahora»). */
const MUSIC_PLATFORMS: readonly SocialPlatform[] = ['SOUNDCLOUD', 'MIXCLOUD', 'SPOTIFY', 'APPLE_MUSIC', 'BEATPORT', 'BANDCAMP', 'YOUTUBE'];

/** La primera red de música del perfil (con URL https válida), o null. */
export function musicLink(socials: readonly SocialLinkDto[]): string | null {
  for (const platform of MUSIC_PLATFORMS) {
    const href = safeHttpsUrl(socials.find((s) => s.platform === platform)?.url);
    if (href) return href;
  }
  return null;
}

/** Fechas visibles en la tarjeta antes de «Ver todas». */
export const DATES_PREVIEW = 3;

function Icon({ d, className = 'gv-icon' }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  arrow: 'M4 12h15M13 6l6 6-6 6',
  play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  bio: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
  gallery: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  press: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
};

/** El nombre con el «&» en el color de acento (como el concepto). */
function GrooveName({ name }: { name: string }) {
  const parts = name.split('&');
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? <span className="gv-amp">&amp;</span> : null}
          {part}
        </span>
      ))}
    </>
  );
}

/** Los íconos de redes del menú de escritorio. */
function NavSocials({ socials, owner }: { socials: readonly SocialLinkDto[]; owner: string }) {
  const items = socials
    .map((s) => ({ ...s, href: safeHttpsUrl(s.url) }))
    .filter((s): s is SocialLinkDto & { href: string } => !!s.href)
    .slice(0, 5);
  if (!items.length) return null;
  return (
    <span className="gv-nav-socials">
      {items.map((s, i) => {
        const label = s.label?.trim() || SOCIAL_PLATFORMS[s.platform]?.label || 'Enlace';
        return (
          <a
            key={`${s.platform}-${i}`}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            aria-label={`${label} de ${owner} (se abre en otra pestaña)`}
          >
            <SocialIcon platform={s.platform} />
          </a>
        );
      })}
    </span>
  );
}

function Tile({ href, icon, label, external }: { href: string; icon: string; label: string; external?: boolean }) {
  const content: ReactNode = (
    <>
      <Icon d={icon} />
      <span>{label}</span>
    </>
  );
  return external ? (
    <a className="gv-tile" href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
      {content}
    </a>
  ) : (
    <a className="gv-tile" href={href}>
      {content}
    </a>
  );
}

/**
 * Plantilla «Neon Groove» (propuesta 02): portada cinematográfica con la foto teñida de violeta y
 * naranja, nombre en cursiva ancha y tarjetas con brillo de neón. Lee el mismo contenido que las
 * demás y reutiliza sus secciones de artistas, fechas y formulario (CSS .djp, reajustado en
 * groove.css). Pura como DjPublicView: props in, markup out.
 */
export function GrooveView({ dj, mode = 'live' }: Props) {
  const { texts } = dj;
  const hasGallery = dj.show.gallery && dj.gallery.length > 0;
  const hasRider = dj.show.rider && dj.riderItems.length > 0;
  const hasArtists = dj.members.length > 0;
  const showEvents = dj.show.events;
  const showBooking = dj.show.form && dj.bookingForm.fields.length > 0;
  const hasBio = !!texts.heroSubtitle;
  const heroWa = isWhatsappUrl(dj.whatsapp.heroUrl) ? dj.whatsapp.heroUrl : null;
  const openDateUrl = dj.show.openDateRow && isWhatsappUrl(dj.whatsapp.openDateUrl) ? dj.whatsapp.openDateUrl : null;
  const music = musicLink(dj.socials);

  const eyebrow = [texts.heroTitle, dj.city].filter(Boolean).join(' · ');
  const bioImage = (hasGallery ? (dj.gallery[1] ?? dj.gallery[0]) : null) ?? dj.members.find((m) => m.photo)?.photo ?? null;
  const riderTitle = texts.riderTitle || texts.riderButton;
  const galleryTitle = texts.galleryTitle || texts.galleryButton;

  // Botón principal: el formulario si hay (si no, WhatsApp). El segundo: escuchar o, si no hay
  // dónde, WhatsApp cuando el principal ya es el formulario.
  const primary = showBooking
    ? { href: '#booking', label: texts.heroSecondaryCta, external: false }
    : heroWa
      ? { href: heroWa, label: texts.heroPrimaryCta, external: true }
      : null;
  const secondary = music
    ? { href: music, label: texts.listenCta, play: true }
    : showBooking && heroWa
      ? { href: heroWa, label: texts.heroPrimaryCta, play: false }
      : null;

  const navLinks: TemplateNavLink[] = [
    hasBio ? { href: '#bio', label: texts.bioTitle } : null,
    music ? { href: music, label: texts.musicLabel, external: true } : null,
    hasArtists ? { href: '#artistas', label: texts.navArtists } : null,
    hasGallery ? { href: '#galeria', label: galleryTitle } : null,
    showEvents ? { href: '#fechas', label: texts.navEvents } : null,
  ].filter((l): l is TemplateNavLink => !!l && !!l.label);

  const tiles = [
    hasBio ? <Tile key="bio" href="#bio" icon={ICONS.bio} label={texts.bioTitle} /> : null,
    music ? <Tile key="music" href={music} icon={ICONS.music} label={texts.musicLabel} external /> : null,
    hasGallery ? <Tile key="gallery" href="#galeria" icon={ICONS.gallery} label={galleryTitle} /> : null,
    hasRider ? <Tile key="rider" href="#rider" icon={ICONS.press} label={riderTitle} /> : null,
  ].filter(Boolean);

  const [datesOpen, setDatesOpen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const { scrolled, stickyOn } = useHeroScroll(heroRef);
  useHtmlTemplate('GROOVE');

  const slide = (dir: 1 | -1) => {
    const track = carouselRef.current?.querySelector<HTMLElement>('.media-grid');
    track?.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
  };

  const stickyHref = primary?.href ?? null;

  return (
    <div className={mode === 'preview' ? 'djp djg djg--preview' : 'djp djg'}>
      <TemplateNav
        prefix="gv"
        displayName={dj.displayName}
        links={navLinks}
        booking={showBooking ? { href: '#booking', label: texts.navBooking } : null}
        scrolled={scrolled}
        extra={<NavSocials socials={dj.socials} owner={dj.displayName} />}
      />
      <main id="main" tabIndex={-1}>
        <header ref={heroRef} className={dj.heroImage ? 'gv-hero' : 'gv-hero gv-hero--plain'} id="intro">
          {dj.heroImage ? (
            <div className="gv-hero-media">
              <ResponsiveImage
                image={dj.heroImage}
                // En vertical la foto horizontal se recorta para cubrir el alto: se ve ~3 veces más ancha.
                sizes="(orientation: portrait) 300vw, 100vw"
                alt={dj.heroImage.alt || texts.heroPhotoAlt || `Show de ${dj.displayName}`}
                priority
              />
              <div className="gv-tint" aria-hidden="true" />
            </div>
          ) : null}
          <div className="gv-hero-glow" aria-hidden="true" />
          <div className="gv-hero-shade" aria-hidden="true" />
          <svg className="gv-wave" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="gv-wave-grad" x1="0" x2="1">
                <stop offset="0" className="gv-stop-a" />
                <stop offset="1" className="gv-stop-b" />
              </linearGradient>
            </defs>
            <path d="M0 150C120 90 220 190 340 130S520 60 600 100" />
            <path d="M0 170C140 120 240 200 360 150S530 90 600 125" />
          </svg>

          <div className="gv-wrap gv-hero-content">
            {eyebrow ? <p className="gv-eyebrow">{eyebrow}</p> : null}
            <h1 className={`gv-name gv-name--${nameSize(dj.displayName)}`}>
              <GrooveName name={dj.displayName} />
            </h1>
            {dj.genres.length ? (
              <p className="gv-genres">
                {dj.genres.map((g, i) => (
                  <span key={g.slug}>
                    {i > 0 ? <span aria-hidden="true"> / </span> : null}
                    {g.name}
                  </span>
                ))}
              </p>
            ) : null}
            {primary || secondary ? (
              <div className="gv-cta">
                {primary ? (
                  <a
                    className="gv-btn gv-btn--primary"
                    href={primary.href}
                    target={primary.external ? '_blank' : undefined}
                    rel={primary.external ? 'noopener noreferrer' : undefined}
                  >
                    {primary.label}
                    <Icon d={ICONS.arrow} className="gv-btn-icon" />
                  </a>
                ) : null}
                {secondary ? (
                  <a className="gv-btn gv-btn--ghost" href={secondary.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                    {secondary.play ? <Icon d={ICONS.play} className="gv-btn-icon gv-btn-icon--play" /> : null}
                    {secondary.label}
                  </a>
                ) : null}
              </div>
            ) : null}
            {texts.heroNote ? <p className="gv-note">{texts.heroNote}</p> : null}
          </div>
        </header>

        {tiles.length > 1 ? (
          <nav className="gv-wrap gv-tiles" aria-label="Accesos rápidos">
            {tiles}
          </nav>
        ) : null}

        {hasBio || showEvents ? (
          <div className={hasBio && showEvents ? 'gv-wrap gv-cards' : 'gv-wrap gv-cards gv-cards--single'}>
            {hasBio ? (
              <section id="bio" className={bioImage ? 'gv-card gv-bio' : 'gv-card gv-bio gv-bio--solo'} aria-labelledby="bio-title">
                {bioImage ? (
                  <div className="gv-bio-media">
                    <ResponsiveImage image={bioImage} sizes="(max-width: 900px) 100vw, 320px" alt={bioImage.alt || `${dj.displayName} en vivo`} />
                    <div className="gv-tint" aria-hidden="true" />
                  </div>
                ) : null}
                <div className="gv-bio-body">
                  <h2 className="gv-card-title" id="bio-title">
                    {texts.bioTitle || dj.displayName}
                  </h2>
                  <p className="gv-bio-text">{texts.heroSubtitle}</p>
                  {hasArtists && texts.storyMoreCta ? (
                    <a className="gv-link" href="#artistas">
                      {texts.storyMoreCta}
                      <Icon d={ICONS.arrow} className="gv-btn-icon" />
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}
            {showEvents ? (
              <div className={datesOpen ? 'gv-card gv-dates is-expanded' : 'gv-card gv-dates'}>
                <ShowsSection texts={texts} events={dj.events} openDateUrl={openDateUrl} />
                {dj.events.length > DATES_PREVIEW ? (
                  <button type="button" className="gv-more" aria-expanded={datesOpen} onClick={() => setDatesOpen((v) => !v)}>
                    {datesOpen ? 'Ver menos' : `Ver las ${dj.events.length} fechas`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="gv-wrap gv-sections">
          {hasArtists ? <ArtistsSection texts={texts} members={dj.members} /> : null}

          {hasGallery ? (
            <section id="galeria" aria-labelledby="galeria-title">
              <div className="gv-section-head">
                <h2 className="sec-title" id="galeria-title">
                  {galleryTitle}
                </h2>
                {dj.gallery.length > 2 ? (
                  <div className="gv-arrows">
                    <button type="button" aria-label="Fotos anteriores" onClick={() => slide(-1)}>
                      <Icon d="M15 5l-7 7 7 7" />
                    </button>
                    <button type="button" aria-label="Fotos siguientes" onClick={() => slide(1)}>
                      <Icon d="M9 5l7 7-7 7" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div ref={carouselRef} className="gv-carousel">
                <GalleryGrid images={dj.gallery} displayName={dj.displayName} />
              </div>
            </section>
          ) : null}

          {hasRider ? (
            <section id="rider" aria-labelledby="rider-title">
              <h2 className="sec-title" id="rider-title">
                {riderTitle}
              </h2>
              <ul className="gv-rider">
                {dj.riderItems.map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    <b>{item.name}</b>
                    {item.note ? <span>{item.note}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showBooking ? <BookingSection dj={dj} preview={mode === 'preview'} /> : null}
        </div>
      </main>

      <footer className="gv-footer">
        <div className="gv-wrap gv-footer-row">
          <p className="gv-footer-name">
            <GrooveName name={dj.displayName} />
          </p>
          <SocialLinks links={dj.socials} className="gv-socials" ownerName={dj.displayName} />
          <p className="gv-footer-copy">
            © {new Date().getFullYear()} {texts.footerText || `${dj.displayName} — Booking`}
          </p>
        </div>
      </footer>

      {stickyHref && primary ? (
        <a
          className={stickyOn ? 'gv-sticky is-on' : 'gv-sticky'}
          href={stickyHref}
          aria-hidden={!stickyOn || undefined}
          tabIndex={stickyOn ? undefined : -1}
          target={primary.external ? '_blank' : undefined}
          rel={primary.external ? 'noopener noreferrer' : undefined}
        >
          {primary.label}
          <Icon d={ICONS.arrow} className="gv-btn-icon" />
        </a>
      ) : null}
    </div>
  );
}
