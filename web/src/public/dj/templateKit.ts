import type { TemplateKey } from '@fersua/shared';
import { useEffect, useState, type RefObject } from 'react';

// Piezas que comparten las plantillas de portada a pantalla completa (Signal, Neon Groove).

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
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.template = template;
    return () => {
      delete root.dataset.template;
    };
  }, [template]);
}

/**
 * Estado del scroll: `scrolled` (el menú toma fondo) y `stickyOn` (el CTA fijo del teléfono se ve
 * entre el final de la portada y el formulario #booking).
 */
export function useHeroScroll(heroRef: RefObject<HTMLElement | null>): { scrolled: boolean; stickyOn: boolean } {
  const [scrolled, setScrolled] = useState(false);
  const [stickyOn, setStickyOn] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 24);
      const hero = heroRef.current?.getBoundingClientRect();
      const booking = document.getElementById('booking')?.getBoundingClientRect();
      const pastHero = !!hero && hero.bottom < 80;
      const atBooking = !!booking && booking.top < window.innerHeight;
      setStickyOn(pastHero && !atBooking);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [heroRef]);
  return { scrolled, stickyOn };
}
