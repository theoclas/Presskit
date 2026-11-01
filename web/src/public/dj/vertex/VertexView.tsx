import { SOCIAL_PLATFORMS, type PublicDjProfileDto, type SocialLinkDto } from '@fersua/shared';
import { useRef, type ReactNode } from 'react';
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
// Este paquete exporta «./*» → «./*.css»: se importa sin la extensión.
import '@fontsource-variable/big-shoulders-display/wght';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './vertex.css';

interface Props {
  dj: PublicDjProfileDto;
  /** 'preview': vista previa del editor (el formulario no se envía). */
  mode?: 'live' | 'preview';
}

function Arrow() {
  return (
    <svg className="vx-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

/** El nombre con el «&» en naranja señalética. */
function VertexName({ name }: { name: string }) {
  return (
    <>
      {name.split('&').map((part, i) => (
        <span key={i}>
          {i > 0 ? <span className="vx-amp">&amp;</span> : null}
          {part}
        </span>
      ))}
    </>
  );
}

interface Module {
  /** Ancla de la sección (para el índice). */
  href: string;
  label: string;
  /** Contenido; recibe el número del módulo («01») para su encabezado. */
  render: (n: string) => ReactNode;
}

/** Encabezado de módulo: número técnico y título (h2). */
function ModuleHead({ n, id, title }: { n: string; id: string; title: string }) {
  return (
    <div className="vx-head">
      <span className="vx-num" aria-hidden="true">
        {n} —
      </span>
      <h2 className="vx-title" id={id}>
        {title}
      </h2>
    </div>
  );
}

/**
 * Plantilla «Vertex Club» (propuesta 05): industrial, estilo flyer de club. En escritorio, la
 * pantalla se divide: la identidad (foto con grano, nombre gigante y botones) queda fija a la
 * izquierda y los módulos numerados pasan a la derecha; fechas como boletas, galería como tira de
 * película y rider como ficha técnica. En el teléfono se recompone en una sola columna. Reutiliza
 * artistas, fechas y formulario (CSS .djp, reajustado en vertex.css). Pura: props in, markup out.
 */
export function VertexView({ dj, mode = 'live' }: Props) {
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
  const socials = dj.socials
    .map((s) => ({ ...s, href: safeHttpsUrl(s.url) }))
    .filter((s): s is SocialLinkDto & { href: string } => !!s.href);
  const riderTitle = texts.riderTitle || texts.riderButton;
  const galleryTitle = texts.galleryTitle || texts.galleryButton;
  const meta = [texts.heroLabel, dj.city].filter(Boolean).join(' / ');

  const contact = showBooking
    ? { href: '#booking', label: texts.heroSecondaryCta, external: false }
    : heroWa
      ? { href: heroWa, label: texts.heroPrimaryCta, external: true }
      : null;

  const heroRef = useRef<HTMLElement>(null);
  const { scrolled, stickyOn } = useHeroScroll(heroRef);
  useHtmlTemplate('VERTEX');

  const modules: Module[] = [];
  if (hasBio) {
    modules.push({
      href: '#bio',
      label: texts.bioTitle,
      render: (n) => (
        <section id="bio" className="vx-module" aria-labelledby="bio-title">
          <ModuleHead n={n} id="bio-title" title={texts.bioTitle || dj.displayName} />
          <p className="vx-bio-text">{texts.heroSubtitle}</p>
          {hasArtists && texts.storyMoreCta ? (
            <a className="vx-link" href="#artistas">
              {texts.storyMoreCta}
              <Arrow />
            </a>
          ) : null}
        </section>
      ),
    });
  }
  if (music.length) {
    modules.push({
      href: '#musica',
      label: texts.musicLabel,
      render: (n) => (
        <section id="musica" className="vx-module" aria-labelledby="musica-title">
          <ModuleHead n={n} id="musica-title" title={texts.musicLabel} />
          <div className="vx-patch">
            {music.map((m, i) => (
              <a key={`${m.platform}-${m.href}`} className="vx-patch-row" href={m.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                <span className="vx-patch-n" aria-hidden="true">
                  CH.{String(i + 1).padStart(2, '0')}
                </span>
                <SocialIcon platform={m.platform} />
                <span className="vx-patch-label">{m.label?.trim() || SOCIAL_PLATFORMS[m.platform]?.label}</span>
                <Arrow />
              </a>
            ))}
          </div>
        </section>
      ),
    });
  }
  if (showEvents) {
    modules.push({
      href: '#fechas',
      label: texts.navEvents,
      render: (n) => (
        <div className="vx-module vx-module--tickets">
          <span className="vx-num vx-num--alone" aria-hidden="true">
            {n} —
          </span>
          <ShowsSection texts={texts} events={dj.events} openDateUrl={openDateUrl} />
        </div>
      ),
    });
  }
  if (hasGallery) {
    modules.push({
      href: '#galeria',
      label: galleryTitle,
      render: (n) => (
        <section id="galeria" className="vx-module" aria-labelledby="galeria-title">
          <ModuleHead n={n} id="galeria-title" title={galleryTitle} />
          <div className="vx-strip">
            <GalleryGrid images={dj.gallery} displayName={dj.displayName} />
          </div>
        </section>
      ),
    });
  }
  if (hasArtists) {
    modules.push({
      href: '#artistas',
      label: texts.navArtists,
      render: (n) => (
        <div className="vx-module">
          <span className="vx-num vx-num--alone" aria-hidden="true">
            {n} —
          </span>
          <ArtistsSection texts={texts} members={dj.members} />
        </div>
      ),
    });
  }
  if (hasRider) {
    modules.push({
      href: '#rider',
      label: riderTitle,
      render: (n) => (
        <section id="rider" className="vx-module" aria-labelledby="rider-title">
          <ModuleHead n={n} id="rider-title" title={riderTitle} />
          <ol className="vx-spec">
            {dj.riderItems.map((item, i) => (
              <li key={`${item.name}-${i}`}>
                <span className="vx-spec-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <b>{item.name}</b>
                {item.note ? (
                  <>
                    <span className="vx-spec-dots" aria-hidden="true" />
                    <span className="vx-spec-note">{item.note}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ),
    });
  }
  if (showBooking) {
    modules.push({
      href: '#booking',
      label: texts.navBooking,
      render: (n) => (
        <div className="vx-module vx-module--booking">
          <span className="vx-num vx-num--alone" aria-hidden="true">
            {n} —
          </span>
          <BookingSection dj={dj} preview={mode === 'preview'} />
        </div>
      ),
    });
  }

  const navLinks: TemplateNavLink[] = modules
    .filter((m) => m.href !== '#booking' && m.label)
    .map((m) => ({ href: m.href, label: m.label }));

  return (
    <div className={mode === 'preview' ? 'djp djv djv--preview' : 'djp djv'}>
      <TemplateNav
        prefix="vx"
        displayName={dj.displayName}
        links={navLinks}
        booking={showBooking ? { href: '#booking', label: texts.navBooking } : null}
        scrolled={scrolled}
      />
      <div className="vx-split">
        <header ref={heroRef} className={dj.heroImage ? 'vx-pin' : 'vx-pin vx-pin--plain'} id="intro">
          {dj.heroImage ? (
            <div className="vx-pin-media">
              <ResponsiveImage
                image={dj.heroImage}
                sizes="(max-width: 1023px) 220vw, 100vh"
                alt={dj.heroImage.alt || texts.heroPhotoAlt || `Show de ${dj.displayName}`}
                priority
              />
            </div>
          ) : null}
          <div className="vx-grain" aria-hidden="true" />
          <div className="vx-stripe" aria-hidden="true" />
          <div className="vx-pin-content">
            {meta ? <p className="vx-meta">{meta}</p> : null}
            <h1 className={`vx-name vx-name--${nameSize(dj.displayName)}`}>
              <VertexName name={dj.displayName} />
            </h1>
            {texts.heroTitle ? <p className="vx-tagline">{texts.heroTitle}</p> : null}
            {dj.genres.length ? <p className="vx-genres">{dj.genres.map((g) => g.name).join(' / ')}</p> : null}
            {contact || listen ? (
              <div className="vx-cta">
                {contact ? (
                  <a
                    className="vx-btn vx-btn--signal"
                    href={contact.href}
                    target={contact.external ? '_blank' : undefined}
                    rel={contact.external ? 'noopener noreferrer' : undefined}
                  >
                    {contact.label}
                    <Arrow />
                  </a>
                ) : null}
                {listen ? (
                  <a className="vx-btn vx-btn--line" href={listen} target="_blank" rel="noopener noreferrer nofollow ugc">
                    <svg className="vx-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
                    </svg>
                    {texts.listenCta}
                  </a>
                ) : showBooking && heroWa ? (
                  <a className="vx-btn vx-btn--line" href={heroWa} target="_blank" rel="noopener noreferrer">
                    {texts.heroPrimaryCta}
                  </a>
                ) : null}
              </div>
            ) : null}
            {texts.heroNote ? <p className="vx-note">{texts.heroNote}</p> : null}
            {socials.length ? (
              <div className="vx-icons">
                {socials.map((s, i) => {
                  const label = s.label?.trim() || SOCIAL_PLATFORMS[s.platform]?.label || 'Enlace';
                  return (
                    <a
                      key={`${s.platform}-${i}`}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      aria-label={`${label} de ${dj.displayName} (se abre en otra pestaña)`}
                    >
                      <SocialIcon platform={s.platform} />
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
          <span className="vx-corner" aria-hidden="true" />
        </header>

        <main id="main" tabIndex={-1} className="vx-flow">
          {modules.length > 1 ? (
            <nav className="vx-index" aria-label="Módulos">
              {modules.map((m, i) => (
                <a key={m.href} href={m.href}>
                  <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  {m.label}
                </a>
              ))}
            </nav>
          ) : null}
          {modules.map((m, i) => (
            <div key={m.href}>{m.render(String(i + 1).padStart(2, '0'))}</div>
          ))}
          <footer className="vx-footer">
            <p className="vx-footer-name">
              <VertexName name={dj.displayName} />
            </p>
            <p className="vx-footer-copy">
              © {new Date().getFullYear()} {texts.footerText || `${dj.displayName} — Booking`}
            </p>
          </footer>
        </main>
      </div>

      {contact ? (
        <a
          className={stickyOn ? 'vx-sticky is-on' : 'vx-sticky'}
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
