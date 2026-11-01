import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { lockBodyScroll, useTemplateEnv } from './templateEnv';

export interface TemplateNavLink {
  href: string;
  label: string;
  /** Enlace a otro sitio (se abre en otra pestaña). */
  external?: boolean;
}

interface Props {
  /** Prefijo de las clases de la plantilla: 'sg' (Signal) → .sg-nav, .sg-menu… */
  prefix: string;
  displayName: string;
  links: TemplateNavLink[];
  /** El botón de booking del menú (o null si no hay formulario). */
  booking: TemplateNavLink | null;
  /** Con la página bajada, el menú toma fondo. */
  scrolled: boolean;
  /** Algo más a la derecha en escritorio (p. ej. los íconos de redes). */
  extra?: ReactNode;
}

interface NavAnchorProps {
  link: TemplateNavLink;
  className?: string;
  onClick?: () => void;
  ref?: Ref<HTMLAnchorElement>;
}

function NavAnchor({ link, className, onClick, ref }: NavAnchorProps) {
  return link.external ? (
    <a ref={ref} href={link.href} className={className} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={onClick}>
      {link.label}
    </a>
  ) : (
    <a ref={ref} href={link.href} className={className} onClick={onClick}>
      {link.label}
    </a>
  );
}

/**
 * Menú de las plantillas de portada completa: fijo arriba, transparente sobre la portada. En el
 * teléfono, una hamburguesa abre las secciones a pantalla completa (Escape o un enlace la cierran).
 */
export function TemplateNav({ prefix: p, displayName, links, booking, scrolled, extra }: Props) {
  const { doc } = useTemplateEnv();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll(doc);
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => {
      unlock();
      doc.removeEventListener('keydown', onKey);
    };
  }, [open, doc]);

  const all = booking ? [...links, booking] : links;
  const navClass = open ? `${p}-nav is-solid is-open` : scrolled ? `${p}-nav is-solid` : `${p}-nav`;
  return (
    <nav className={navClass} aria-label="Secciones">
      <div className={`${p}-wrap ${p}-nav-row`}>
        <a className={`${p}-brand`} href="#intro" onClick={() => setOpen(false)}>
          {displayName}
        </a>
        <div className={`${p}-nav-links`}>
          {links.map((l) => (
            <NavAnchor key={l.href} link={l} />
          ))}
          {booking ? <NavAnchor link={booking} className={`${p}-nav-cta`} /> : null}
          {extra}
        </div>
        {all.length ? (
          <button
            ref={toggleRef}
            type="button"
            className={open ? `${p}-burger is-open` : `${p}-burger`}
            aria-expanded={open}
            aria-controls={`${p}-menu`}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        ) : null}
      </div>
      <div id={`${p}-menu`} className={open ? `${p}-menu is-open` : `${p}-menu`} hidden={!open}>
        {all.map((l, i) => (
          <NavAnchor
            key={l.href}
            ref={i === 0 ? firstLinkRef : undefined}
            link={l}
            className={l === booking ? `${p}-menu-cta` : undefined}
            onClick={() => setOpen(false)}
          />
        ))}
      </div>
    </nav>
  );
}
