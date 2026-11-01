import { SOCIAL_PLATFORMS, type ImageDto, type PublicDjProfileDto, type SocialLinkDto } from '@fersua/shared';
import { useRef } from 'react';
import { safeHttpsUrl } from '../../../lib/safeUrl';
import { isWhatsappUrl } from '../../../lib/whatsapp';
import { ResponsiveImage } from '../../components/ResponsiveImage';
import { SocialIcon } from '../../components/SocialIcon';
import { ArtistsSection } from '../ArtistsSection';
import { BookingSection } from '../BookingSection';
import { GalleryGrid } from '../GalleryGrid';
import { ShowsSection } from '../ShowsSection';
import { TemplateNav, type TemplateNavLink } from '../TemplateNav';
import { musicLinks, nameSize, useHeroScroll, useHtmlTemplate } from '../templateKit';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import './noir.css';

interface Props {
  dj: PublicDjProfileDto;
  /** 'preview': vista previa del editor (el formulario no se envía). */
  mode?: 'live' | 'preview';
}

function Arrow() {
  return (
    <svg className="nr-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Play() {
  return (
    <svg className="nr-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * El nombre con el «&» en cursiva dorada (como el concepto). El «&» va pegado a la palabra que
 * sigue, así el salto de línea queda «MIKE BRAN / & MACFLY» y no «MIKE BRAN & / MACFLY».
 */
function NoirName({ name }: { name: string }) {
  return (
    <>
      {name.split('&').map((part, i) => {
        if (i === 0) return <span key={i}>{part}</span>;
        const [, lead = '', first = '', rest = ''] = /^(\s*)(\S*)(.*)$/s.exec(part) ?? [];
        return (
          <span key={i}>
            <span className="nr-amp-group">
              <em className="nr-amp">&amp;</em>
              {lead}
              {first}
            </span>
            {rest}
          </span>
        );
      })}
    </>
  );
}

/** Íconos de redes (pie y franja de booking). */
function SocialIcons({ socials, owner, className }: { socials: readonly SocialLinkDto[]; owner: string; className: string }) {
  const items = socials
    .map((s) => ({ ...s, href: safeHttpsUrl(s.url) }))
    .filter((s): s is SocialLinkDto & { href: string } => !!s.href);
  if (!items.length) return null;
  return (
    <div className={className}>
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
    </div>
  );
}

/** Título de sección con la línea dorada a la derecha. */
function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 className="sec-title nr-title" id={id}>
      <span>{children}</span>
    </h2>
  );
}

/**
 * Plantilla «Editorial Noir» (propuesta 03): la única clara. Portada oscura de revista, letra serif
 * fina con el «&» dorado, secciones sobre marfil y bloques borgoña. Lee el mismo contenido que las
 * demás y reutiliza sus secciones de artistas, fechas y formulario (CSS .djp, reajustado en
 * noir.css). Pura como DjPublicView: props in, markup out.
 */
export function NoirView({ dj, mode = 'live' }: Props) {
  const { texts } = dj;
  const hasGallery = dj.show.gallery && dj.gallery.length > 0;
  const hasRider = dj.show.rider && dj.riderItems.length > 0;
  const hasArtists = dj.members.length > 0;
  const showEvents = dj.show.events;
  const showBooking = dj.show.form && dj.bookingForm.fields.length > 0;
  const hasBio = !!texts.heroSubtitle;
  const heroWa = isWhatsappUrl(dj.whatsapp.heroUrl) ? dj.whatsapp.heroUrl : null;
  const openDateUrl = dj.show.openDateRow && isWhatsappUrl(dj.whatsapp.openDateUrl) ? dj.whatsapp.openDateUrl : null;
  const music = musicLinks(dj.socials);
  const listen = music[0]?.href ?? null;

  const subline = [texts.heroLabel, texts.heroTitle].filter(Boolean).join(' / ');
  const riderTitle = texts.riderTitle || texts.riderButton;
  const galleryTitle = texts.galleryTitle || texts.galleryButton;
  // El collage de la biografía: primero las fotos de los integrantes (retratos), luego la galería.
  const collage: ImageDto[] = [
    ...dj.members.map((m) => m.photo).filter((p): p is ImageDto => !!p),
    ...(hasGallery ? dj.gallery : []),
  ].slice(0, 2);
  const accentImage = hasGallery ? (dj.gallery.find((g) => !collage.includes(g)) ?? null) : null;

  // Botones de la portada: escuchar (si hay dónde) y el contacto (formulario o WhatsApp).
  const contact = showBooking
    ? { href: '#booking', label: texts.heroSecondaryCta, external: false }
    : heroWa
      ? { href: heroWa, label: texts.heroPrimaryCta, external: true }
      : null;
  const extraWa = showBooking && heroWa && !listen ? heroWa : null;

  const navLinks: TemplateNavLink[] = [
    hasBio ? { href: '#bio', label: texts.bioTitle } : null,
    music.length ? { href: '#musica', label: texts.musicLabel } : null,
    hasGallery ? { href: '#galeria', label: galleryTitle } : null,
    hasArtists ? { href: '#artistas', label: texts.navArtists } : null,
    showEvents ? { href: '#fechas', label: texts.navEvents } : null,
  ].filter((l): l is TemplateNavLink => !!l && !!l.label);

  const heroRef = useRef<HTMLElement>(null);
  const { scrolled, stickyOn } = useHeroScroll(heroRef);
  useHtmlTemplate('NOIR');

  return (
    <div className={mode === 'preview' ? 'djp djn djn--preview' : 'djp djn'}>
      <TemplateNav
        prefix="nr"
        displayName={dj.displayName}
        links={navLinks}
        booking={showBooking ? { href: '#booking', label: texts.navBooking } : null}
        scrolled={scrolled}
      />
      <main id="main" tabIndex={-1}>
        <header ref={heroRef} className={dj.heroImage ? 'nr-hero' : 'nr-hero nr-hero--plain'} id="intro">
          {dj.heroImage ? (
            <div className="nr-hero-media">
              <ResponsiveImage
                image={dj.heroImage}
                sizes="(orientation: portrait) 220vw, 70vw"
                alt={dj.heroImage.alt || texts.heroPhotoAlt || `Show de ${dj.displayName}`}
                priority
              />
            </div>
          ) : null}
          <div className="nr-wrap nr-hero-content">
            <h1 className={`nr-name nr-name--${nameSize(dj.displayName)}`}>
              <NoirName name={dj.displayName} />
            </h1>
            {subline ? <p className="nr-subline">{subline}</p> : null}
            {listen || contact ? (
              <div className="nr-cta">
                {listen ? (
                  <a className="nr-btn nr-btn--gold" href={listen} target="_blank" rel="noopener noreferrer nofollow ugc">
                    {texts.listenCta}
                    <Play />
                  </a>
                ) : null}
                {contact ? (
                  <a
                    className="nr-btn nr-btn--ivory"
                    href={contact.href}
                    target={contact.external ? '_blank' : undefined}
                    rel={contact.external ? 'noopener noreferrer' : undefined}
                  >
                    {contact.label}
                    <Arrow />
                  </a>
                ) : null}
                {extraWa ? (
                  <a className="nr-btn nr-btn--gold" href={extraWa} target="_blank" rel="noopener noreferrer">
                    {texts.heroPrimaryCta}
                  </a>
                ) : null}
              </div>
            ) : null}
            {texts.heroNote ? <p className="nr-note">{texts.heroNote}</p> : null}
          </div>
        </header>

        {hasBio ? (
          <section id="bio" className="nr-bio" aria-labelledby="bio-title">
            <div className="nr-wrap nr-bio-grid">
              {collage.length ? (
                <div className={collage.length > 1 ? 'nr-collage' : 'nr-collage nr-collage--one'}>
                  {collage.map((img, i) => (
                    <ResponsiveImage
                      key={img.id}
                      image={img}
                      sizes="(max-width: 900px) 50vw, 260px"
                      alt={img.alt || `${dj.displayName} — foto ${i + 1}`}
                    />
                  ))}
                </div>
              ) : null}
              <div className="nr-bio-body">
                <SectionTitle id="bio-title">{texts.bioTitle || dj.displayName}</SectionTitle>
                <p className="nr-bio-text">{texts.heroSubtitle}</p>
                {hasArtists && texts.storyMoreCta ? (
                  <a className="nr-btn nr-btn--line" href="#artistas">
                    {texts.storyMoreCta}
                    <Arrow />
                  </a>
                ) : null}
              </div>
              <div className="nr-bio-accent" aria-hidden="true">
                {accentImage ? <ResponsiveImage image={accentImage} sizes="(max-width: 900px) 100vw, 220px" alt="" /> : null}
              </div>
            </div>
          </section>
        ) : null}

        <div className="nr-wrap nr-sections">
          {music.length ? (
            <section id="musica" aria-labelledby="musica-title">
              <SectionTitle id="musica-title">{texts.musicLabel}</SectionTitle>
              <div className="nr-music">
                {music.map((m) => (
                  <a key={`${m.platform}-${m.href}`} className="nr-music-link" href={m.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                    <SocialIcon platform={m.platform} />
                    <span>{m.label?.trim() || SOCIAL_PLATFORMS[m.platform]?.label}</span>
                    <Arrow />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {hasGallery ? (
            <section id="galeria" aria-labelledby="galeria-title">
              <SectionTitle id="galeria-title">{galleryTitle}</SectionTitle>
              <GalleryGrid images={dj.gallery} displayName={dj.displayName} />
            </section>
          ) : null}

          {hasArtists ? <ArtistsSection texts={texts} members={dj.members} /> : null}
        </div>

        {showEvents ? (
          <div className="nr-band">
            <div className="nr-wrap">
              <ShowsSection texts={texts} events={dj.events} openDateUrl={openDateUrl} />
            </div>
          </div>
        ) : null}

        <div className="nr-wrap nr-sections">
          {hasRider ? (
            <section id="rider" aria-labelledby="rider-title">
              <SectionTitle id="rider-title">{riderTitle}</SectionTitle>
              <ol className="nr-rider">
                {dj.riderItems.map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    <span className="nr-rider-n" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <b>{item.name}</b>
                      {item.note ? <span className="nr-rider-note">{item.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {showBooking ? <BookingSection dj={dj} preview={mode === 'preview'} /> : null}
        </div>
      </main>

      <footer className="nr-footer">
        <div className="nr-wrap nr-footer-row">
          <p className="nr-footer-name">
            <NoirName name={dj.displayName} />
          </p>
          <SocialIcons socials={dj.socials} owner={dj.displayName} className="nr-icons" />
          <p className="nr-footer-copy">
            © {new Date().getFullYear()} {texts.footerText || `${dj.displayName} — Booking`}
          </p>
        </div>
      </footer>

      {contact ? (
        <a
          className={stickyOn ? 'nr-sticky is-on' : 'nr-sticky'}
          href={contact.href}
          aria-hidden={!stickyOn || undefined}
          tabIndex={stickyOn ? undefined : -1}
          target={contact.external ? '_blank' : undefined}
          rel={contact.external ? 'noopener noreferrer' : undefined}
        >
          {contact.label}
          <Arrow />
        </a>
      ) : null}
    </div>
  );
}
