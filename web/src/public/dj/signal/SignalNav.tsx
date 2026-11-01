import { useEffect, useRef, useState } from 'react';

export interface SignalNavLink {
  href: string;
  label: string;
}

interface Props {
  displayName: string;
  links: SignalNavLink[];
  /** El botón de booking del menú (o null si no hay formulario). */
  booking: SignalNavLink | null;
  /** Con la página bajada, el menú toma fondo. */
  scrolled: boolean;
}

/**
 * Menú de la plantilla Signal: fijo arriba, transparente sobre la portada. En el teléfono, una
 * hamburguesa abre las secciones a pantalla completa (Escape o un enlace la cierran).
 */
export function SignalNav({ displayName, links, booking, scrolled }: Props) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const all = booking ? [...links, booking] : links;
  return (
    <nav className={open ? 'sg-nav is-solid is-open' : scrolled ? 'sg-nav is-solid' : 'sg-nav'} aria-label="Secciones">
      <div className="sg-wrap sg-nav-row">
        <a className="sg-brand" href="#intro" onClick={() => setOpen(false)}>
          {displayName}
        </a>
        <div className="sg-nav-links">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          {booking ? (
            <a className="sg-nav-cta" href={booking.href}>
              {booking.label}
            </a>
          ) : null}
        </div>
        {all.length ? (
          <button
            ref={toggleRef}
            type="button"
            className={open ? 'sg-burger is-open' : 'sg-burger'}
            aria-expanded={open}
            aria-controls="sg-menu"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        ) : null}
      </div>
      <div id="sg-menu" className={open ? 'sg-menu is-open' : 'sg-menu'} hidden={!open}>
        {all.map((l, i) => (
          <a
            key={l.href}
            ref={i === 0 ? firstLinkRef : undefined}
            href={l.href}
            className={l === booking ? 'sg-menu-cta' : undefined}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
