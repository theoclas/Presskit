import type { PublicDjProfileDto } from '@fersua/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeImageUrl } from '../../lib/safeUrl';
import { isWhatsappUrl } from '../../lib/whatsapp';
import { IMAGE_SIZES } from '../components/ResponsiveImage';
import { ArtistsSection } from './ArtistsSection';
import { BookingSection } from './BookingSection';
import { DjFooter } from './DjFooter';
import { DjHero } from './DjHero';
import { DjNav } from './DjNav';
import { HeroMiniCards } from './HeroMiniCards';
import { MediaModule, type MediaTab } from './MediaModule';
import { ShowsSection } from './ShowsSection';
import './dj-template.css';
import './dj-additions.css';

interface Props {
  dj: PublicDjProfileDto;
  /** 'preview': vista previa del editor (el formulario no se envía). */
  mode?: 'live' | 'preview';
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * La página pública de un DJ: la plantilla de Mac Fly & Mike Bran en componentes.
 * Es pura (props in, markup out) para que la página y la vista previa la compartan.
 * Una sección se oculta si su interruptor está apagado o si no tiene contenido.
 */
export function DjPublicView({ dj, mode = 'live' }: Props) {
  const { texts } = dj;
  const hasGallery = dj.show.gallery && dj.gallery.length > 0;
  const hasRider = dj.show.rider && dj.riderItems.length > 0;
  const hasArtists = dj.members.length > 0;
  const showEvents = dj.show.events;
  const showBooking = dj.show.form && dj.bookingForm.fields.length > 0;
  const heroWa = isWhatsappUrl(dj.whatsapp.heroUrl) ? dj.whatsapp.heroUrl : null;
  const openDateUrl = dj.show.openDateRow && isWhatsappUrl(dj.whatsapp.openDateUrl) ? dj.whatsapp.openDateUrl : null;

  // Como el script de la plantilla: "Photos" arranca marcado y el módulo oculto.
  const [activeTab, setActiveTab] = useState<MediaTab>(hasGallery ? 'photos' : 'rider');
  const [moduleVisible, setModuleVisible] = useState(false);
  const [scrollTick, setScrollTick] = useState(0);
  const moduleRef = useRef<HTMLElement>(null);
  const prefetched = useRef(false);

  const onTab = useCallback((tab: MediaTab) => {
    setModuleVisible(true);
    setActiveTab(tab);
    setScrollTick((n) => n + 1);
  }, []);

  // Tras mostrar el módulo: scroll suave hasta él y foco (sin segundo salto).
  useEffect(() => {
    if (!scrollTick) return;
    const el = moduleRef.current;
    if (!el) return;
    el.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [scrollTick]);

  // Al acercarse al botón "Photos" se precargan las primeras fotos para que el módulo abra lleno.
  const prefetchGallery = useCallback(() => {
    if (prefetched.current || typeof Image === 'undefined') return;
    prefetched.current = true;
    for (const img of dj.gallery.slice(0, 6)) {
      const variants = img.variants.filter((v) => safeImageUrl(v.url));
      if (!variants.length) continue;
      const pre = new Image();
      pre.sizes = IMAGE_SIZES.gallery;
      pre.srcset = variants.map((v) => `${v.url} ${v.w}w`).join(', ');
    }
  }, [dj.gallery]);

  const miniCards =
    hasRider || hasGallery ? (
      <HeroMiniCards
        texts={texts}
        hasRider={hasRider}
        hasGallery={hasGallery}
        activeTab={activeTab}
        moduleVisible={moduleVisible}
        onTab={onTab}
        onPrefetchGallery={prefetchGallery}
      />
    ) : null;

  return (
    <div className="djp">
      <div className="shell">
        <DjNav
          displayName={dj.displayName}
          texts={texts}
          showArtists={hasArtists}
          showEvents={showEvents}
          showBooking={showBooking}
        />
        <main id="main" tabIndex={-1}>
          <DjHero
            displayName={dj.displayName}
            texts={texts}
            genres={dj.genres}
            socials={dj.socials}
            heroImage={dj.heroImage}
            heroWhatsappUrl={heroWa}
            showBookingLink={showBooking}
            miniCards={miniCards}
          />

          {hasGallery || hasRider ? (
            <MediaModule
              ref={moduleRef}
              visible={moduleVisible}
              activeTab={activeTab}
              texts={texts}
              displayName={dj.displayName}
              gallery={hasGallery ? dj.gallery : null}
              riderItems={hasRider ? dj.riderItems : null}
            />
          ) : null}

          {hasArtists || showEvents ? (
            <div className={hasArtists && showEvents ? 'grid' : 'grid grid--single'}>
              {hasArtists ? <ArtistsSection texts={texts} members={dj.members} /> : null}
              {showEvents ? <ShowsSection texts={texts} events={dj.events} openDateUrl={openDateUrl} /> : null}
            </div>
          ) : null}

          {showBooking ? <BookingSection dj={dj} preview={mode === 'preview'} /> : null}
        </main>
        <DjFooter text={texts.footerText || `${dj.displayName} — Booking`} />
      </div>
    </div>
  );
}
