import { SOCIAL_PLATFORMS, type PublicDjProfileDto, type SocialLinkDto } from '@fersua/shared';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { safeHttpsUrl } from '../../../lib/safeUrl';
import { isWhatsappUrl } from '../../../lib/whatsapp';
import { IMAGE_SIZES, ResponsiveImage } from '../../components/ResponsiveImage';
import { SocialIcon } from '../../components/SocialIcon';
import { ArtistsSection } from '../ArtistsSection';
import { BookingSection } from '../BookingSection';
import { Lightbox } from '../Lightbox';
import { ShowsSection } from '../ShowsSection';
import { TemplateNav, type TemplateNavLink } from '../TemplateNav';
import { musicLinks, nameSize, useHeroScroll, useHtmlTemplate } from '../templateKit';
import '@fontsource-variable/unbounded/wght.css';
import './hyperwave.css';

interface Props {
  dj: PublicDjProfileDto;
  /** 'preview': vista previa del editor (el formulario no se envía). */
  mode?: 'live' | 'preview';
}

/** Fechas visibles en la tarjeta antes de «Ver todas». */
export const HW_DATES_PREVIEW = 3;
/** Miniaturas en la tarjeta de galería (la última muestra «+N» si hay más). */
export const HW_GALLERY_THUMBS = 4;

/**
 * Acomoda las tarjetas en filas de `cols` columnas sin dejar huecos: cada tarjeta pide un ancho
 * (span); si no cabe en lo que queda de la fila, la última de esa fila se estira hasta completarla y
 * la tarjeta pasa a la siguiente. La última fila también se completa.
 */
export function packBento(spans: readonly number[], cols: number): number[] {
  const out = spans.map((s) => Math.min(Math.max(1, s), cols));
  let used = 0;
  for (let i = 0; i < out.length; i++) {
    if (used + out[i]! > cols) {
      out[i - 1]! += cols - used;
      used = 0;
    }
    used += out[i]!;
  }
  if (out.length && used < cols) out[out.length - 1]! += cols - used;
  return out;
}

function Icon({ d, className = 'hw-icon' }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ARROW = 'M4 12h15M13 6l6 6-6 6';
const PLAY = 'M8 5.5v13l10.5-6.5L8 5.5Z';

/** Encabezado de tarjeta: «// TÍTULO» (h2) y, opcional, un enlace con flecha. */
function TileHead({ id, title, more }: { id: string; title: string; more?: { href: string; label: string } }) {
  return (
    <div className="hw-tile-head">
      <h2 className="hw-kicker" id={id}>
        {title}
      </h2>
      {more ? (
        <a className="hw-tile-more" href={more.href} aria-label={more.label}>
          <Icon d={ARROW} />
        </a>
      ) : null}
    </div>
  );
}

interface Tile {
  key: string;
  span: number;
  node: ReactNode;
}

/**
 * Plantilla «Hyperwave» (propuesta 04, en mosaico): toda la página es una cuadrícula de tarjetas de
 * vidrio oscuro con bordes y brillos azules, el nombre en cromo y un menú flotante. A diferencia del
 * resto, no hay portada a lo ancho ni secciones una debajo de otra. Reutiliza artistas, fechas y
 * formulario (CSS .djp, reajustado en hyperwave.css). Pura como DjPublicView: props in, markup out.
 */
export function HyperwaveView({ dj, mode = 'live' }: Props) {
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
  const chips = [texts.heroLabel, dj.city].filter(Boolean);

  const [datesOpen, setDatesOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const { scrolled, stickyOn } = useHeroScroll(ctaRef);
  useHtmlTemplate('HYPERWAVE');

  const contact = showBooking
    ? { href: '#booking', label: texts.heroSecondaryCta, external: false }
    : heroWa
      ? { href: heroWa, label: texts.heroPrimaryCta, external: true }
      : null;

  const stats = [
    hasArtists ? { n: dj.members.length, label: dj.members.length === 1 ? 'Artista' : 'Artistas' } : null,
    dj.genres.length ? { n: dj.genres.length, label: dj.genres.length === 1 ? 'Género' : 'Géneros' } : null,
    showEvents && dj.events.length ? { n: dj.events.length, label: dj.events.length === 1 ? 'Fecha' : 'Fechas' } : null,
    hasGallery ? { n: dj.gallery.length, label: 'Fotos' } : null,
  ].filter((s): s is { n: number; label: string } => !!s);

  const navLinks: TemplateNavLink[] = [
    hasBio ? { href: '#bio', label: texts.bioTitle } : null,
    music.length ? { href: '#musica', label: texts.musicLabel } : null,
    hasGallery ? { href: '#galeria', label: galleryTitle } : null,
    hasArtists ? { href: '#artistas', label: texts.navArtists } : null,
    showEvents ? { href: '#fechas', label: texts.navEvents } : null,
  ].filter((l): l is TemplateNavLink => !!l && !!l.label);

  const thumbs = dj.gallery.slice(0, HW_GALLERY_THUMBS);
  const extraPhotos = dj.gallery.length - thumbs.length;

  // Tarjetas del mosaico, en orden; el ancho pedido es sobre 12 columnas (escritorio).
  const tiles: Tile[] = [];
  if (hasBio) {
    tiles.push({
      key: 'bio',
      span: 5,
      node: (
        <section id="bio" className="hw-tile hw-bio" aria-labelledby="bio-title">
          <TileHead id="bio-title" title={texts.bioTitle || dj.displayName} />
          <p className="hw-bio-text">{texts.heroSubtitle}</p>
          {hasArtists && texts.storyMoreCta ? (
            <a className="hw-btn hw-btn--line" href="#artistas">
              {texts.storyMoreCta}
              <Icon d={ARROW} className="hw-btn-icon" />
            </a>
          ) : null}
        </section>
      ),
    });
  }
  if (stats.length) {
    tiles.push({
      key: 'stats',
      span: 3,
      node: (
        <div className="hw-tile hw-stats">
          {stats.map((s) => (
            <div className="hw-stat" key={s.label}>
              <span className="hw-stat-n">{String(s.n).padStart(2, '0')}</span>
              <span className="hw-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      ),
    });
  }
  if (music.length) {
    tiles.push({
      key: 'music',
      span: 4,
      node: (
        <section id="musica" className="hw-tile hw-music" aria-labelledby="musica-title">
          <TileHead id="musica-title" title={texts.musicLabel} />
          <div className="hw-music-list">
            {music.map((m) => (
              <a key={`${m.platform}-${m.href}`} className="hw-row-link" href={m.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                <SocialIcon platform={m.platform} />
                <span>{m.label?.trim() || SOCIAL_PLATFORMS[m.platform]?.label}</span>
                <Icon d={ARROW} className="hw-btn-icon" />
              </a>
            ))}
          </div>
        </section>
      ),
    });
  }
  if (hasGallery) {
    tiles.push({
      key: 'gallery',
      span: 7,
      node: (
        <section id="galeria" className="hw-tile hw-gallery" aria-labelledby="galeria-title">
          <TileHead id="galeria-title" title={galleryTitle} />
          <div className="hw-thumbs">
            {thumbs.map((img, i) => (
              <button
                type="button"
                key={img.id}
                className="hw-thumb"
                onClick={() => setLightbox(i)}
                aria-label={`Ver foto ${i + 1} de ${dj.gallery.length}`}
              >
                <ResponsiveImage image={img} sizes={IMAGE_SIZES.gallery} alt={img.alt || `${dj.displayName} — foto ${i + 1}`} />
                {i === thumbs.length - 1 && extraPhotos > 0 ? (
                  <span className="hw-thumb-more" aria-hidden="true">
                    +{extraPhotos}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <Lightbox images={dj.gallery} index={lightbox} altFallback={dj.displayName} onClose={() => setLightbox(null)} onIndex={setLightbox} />
        </section>
      ),
    });
  }
  if (showEvents) {
    tiles.push({
      key: 'dates',
      span: 5,
      node: (
        <div className={datesOpen ? 'hw-tile hw-dates is-expanded' : 'hw-tile hw-dates'}>
          <ShowsSection texts={texts} events={dj.events} openDateUrl={openDateUrl} />
          {dj.events.length > HW_DATES_PREVIEW ? (
            <button type="button" className="hw-more" aria-expanded={datesOpen} onClick={() => setDatesOpen((v) => !v)}>
              {datesOpen ? 'Ver menos' : `Ver las ${dj.events.length} fechas`}
            </button>
          ) : null}
        </div>
      ),
    });
  }
  if (hasArtists) {
    tiles.push({
      key: 'artists',
      span: 8,
      node: (
        <div className="hw-tile hw-artists">
          <ArtistsSection texts={texts} members={dj.members} />
        </div>
      ),
    });
  }
  if (hasRider) {
    tiles.push({
      key: 'rider',
      span: 4,
      node: (
        <section id="rider" className="hw-tile hw-rider" aria-labelledby="rider-title">
          <TileHead id="rider-title" title={riderTitle} />
          <ul className="hw-rider-list">
            {dj.riderItems.map((item, i) => (
              <li key={`${item.name}-${i}`}>
                <b>{item.name}</b>
                {item.note ? <span>{item.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ),
    });
  }
  if (socials.length) {
    tiles.push({
      key: 'socials',
      span: 4,
      node: (
        <div className="hw-tile hw-socials">
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
      ),
    });
  }
  if (showBooking) {
    tiles.push({
      key: 'booking',
      span: 12,
      node: (
        <div className="hw-tile hw-booking">
          <BookingSection dj={dj} preview={mode === 'preview'} />
        </div>
      ),
    });
  }
  const lg = packBento(
    tiles.map((t) => t.span),
    12,
  );
  // Tableta: 2 columnas; las tarjetas anchas (7+ de 12) ocupan las dos.
  const md = packBento(
    tiles.map((t) => (t.span >= 7 ? 2 : 1)),
    2,
  );

  return (
    <div className={mode === 'preview' ? 'djp djh djh--preview' : 'djp djh'}>
      <TemplateNav
        prefix="hw"
        displayName={dj.displayName}
        links={navLinks}
        booking={showBooking ? { href: '#booking', label: texts.navBooking } : null}
        scrolled={scrolled}
      />
      <main id="main" tabIndex={-1} className="hw-wrap">
        <div className={dj.heroImage ? 'hw-top' : 'hw-top hw-top--plain'} id="intro">
          {dj.heroImage ? (
            <div className="hw-tile hw-photo">
              <ResponsiveImage
                image={dj.heroImage}
                sizes="(max-width: 900px) 200vw, 900px"
                alt={dj.heroImage.alt || texts.heroPhotoAlt || `Show de ${dj.displayName}`}
                priority
              />
              <span className="hw-hud" aria-hidden="true">
                <span className="hw-hud-cross" />
                {dj.city ? <span className="hw-hud-text">{dj.city}</span> : null}
              </span>
            </div>
          ) : null}
          <header className="hw-tile hw-name">
            {chips.length ? (
              <ul className="hw-chips" aria-label="Datos">
                {chips.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
            <h1 className={`hw-title hw-title--${nameSize(dj.displayName)}`}>{dj.displayName}</h1>
            {texts.heroTitle ? <p className="hw-tagline">{texts.heroTitle}</p> : null}
            {dj.genres.length ? <p className="hw-genres">{dj.genres.map((g) => g.name).join(' / ')}</p> : null}
          </header>
          {contact || listen || heroWa ? (
            <div ref={ctaRef} className="hw-tile hw-cta">
              {contact ? (
                <a
                  className="hw-btn hw-btn--holo"
                  href={contact.href}
                  target={contact.external ? '_blank' : undefined}
                  rel={contact.external ? 'noopener noreferrer' : undefined}
                >
                  {contact.label}
                  <Icon d={ARROW} className="hw-btn-icon" />
                </a>
              ) : null}
              {listen ? (
                <a className="hw-btn hw-btn--glass" href={listen} target="_blank" rel="noopener noreferrer nofollow ugc">
                  <svg className="hw-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d={PLAY} fill="currentColor" />
                  </svg>
                  {texts.listenCta}
                </a>
              ) : showBooking && heroWa ? (
                <a className="hw-btn hw-btn--glass" href={heroWa} target="_blank" rel="noopener noreferrer">
                  {texts.heroPrimaryCta}
                </a>
              ) : null}
              {texts.heroNote ? <p className="hw-note">{texts.heroNote}</p> : null}
            </div>
          ) : null}
        </div>

        {tiles.length ? (
          <div className="hw-bento">
            {tiles.map((t, i) => (
              <div
                key={t.key}
                className="hw-cell"
                style={{ '--span-lg': lg[i], '--span-md': md[i], '--i': i } as CSSProperties}
              >
                {t.node}
              </div>
            ))}
          </div>
        ) : null}
      </main>

      <footer className="hw-footer">
        <div className="hw-wrap hw-footer-row">
          <p className="hw-footer-name">{dj.displayName}</p>
          <p className="hw-footer-copy">
            © {new Date().getFullYear()} {texts.footerText || `${dj.displayName} — Booking`}
          </p>
        </div>
      </footer>

      {contact ? (
        <a
          className={stickyOn ? 'hw-sticky is-on' : 'hw-sticky'}
          href={contact.href}
          aria-hidden={!stickyOn || undefined}
          tabIndex={stickyOn ? undefined : -1}
          target={contact.external ? '_blank' : undefined}
          rel={contact.external ? 'noopener noreferrer' : undefined}
        >
          {contact.label}
          <Icon d={ARROW} className="hw-btn-icon" />
        </a>
      ) : null}
    </div>
  );
}
