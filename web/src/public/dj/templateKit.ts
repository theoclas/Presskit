import type { SocialLinkDto, SocialPlatform, TemplateKey } from '@fersua/shared';
import { useEffect, useState, type RefObject } from 'react';
import { safeHttpsUrl } from '../../lib/safeUrl';
import { markTemplate, useTemplateEnv } from './templateEnv';

// Piezas que comparten las plantillas nuevas (Signal, Neon Groove, Editorial Noir).

/** Dónde se escucha al DJ, en este orden de preferencia (botones «Escuchar ahora» y «Música»). */
export const MUSIC_PLATFORMS: readonly SocialPlatform[] = ['SOUNDCLOUD', 'MIXCLOUD', 'SPOTIFY', 'APPLE_MUSIC', 'BEATPORT', 'BANDCAMP', 'YOUTUBE'];

/** Las redes de música del perfil (con URL https válida), en el orden de MUSIC_PLATFORMS. */
export function musicLinks(socials: readonly SocialLinkDto[]): (SocialLinkDto & { href: string })[] {
  const out: (SocialLinkDto & { href: string })[] = [];
  for (const platform of MUSIC_PLATFORMS) {
    for (const s of socials) {
      const href = s.platform === platform ? safeHttpsUrl(s.url) : null;
      if (href) out.push({ ...s, href });
    }
  }
  return out;
}

/** La primera red de música del perfil, o null. */
export function musicLink(socials: readonly SocialLinkDto[]): string | null {
  return musicLinks(socials)[0]?.href ?? null;
}

/** Tamaño del nombre gigante según su largo: un nombre largo no rompe la portada. */
export function nameSize(name: string): 'xl' | 'l' | 'm' | 's' {
  const len = [...name.trim()].length;
  if (len <= 10) return 'xl';
  if (len <= 18) return 'l';
  if (len <= 28) return 'm';
  return 's';
}

/** El fondo de <body> (overscroll, bordes) pasa al de la plantilla mientras se ve. */
export function useHtmlTemplate(template: TemplateKey): void {
  const { doc } = useTemplateEnv();
  useEffect(() => markTemplate(doc, template), [template, doc]);
}

/**
 * Estado del scroll: `scrolled` (el menú toma fondo) y `stickyOn` (el CTA fijo del teléfono se ve
 * entre el final de la portada y el formulario #booking).
 */
export function useHeroScroll(heroRef: RefObject<HTMLElement | null>): { scrolled: boolean; stickyOn: boolean } {
  const { win, doc } = useTemplateEnv();
  const [scrolled, setScrolled] = useState(false);
  const [stickyOn, setStickyOn] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(win.scrollY > 24);
      const hero = heroRef.current?.getBoundingClientRect();
      const booking = doc.getElementById('booking')?.getBoundingClientRect();
      const pastHero = !!hero && hero.bottom < 80;
      const atBooking = !!booking && booking.top < win.innerHeight;
      setStickyOn(pastHero && !atBooking);
    };
    const onScroll = () => {
      if (!frame) frame = win.requestAnimationFrame(update);
    };
    update();
    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) win.cancelAnimationFrame(frame);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onScroll);
    };
  }, [heroRef, win, doc]);
  return { scrolled, stickyOn };
}
