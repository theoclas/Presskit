import { Link } from 'react-router';

interface Props {
  tag?: string;
  links?: { href: string; label: string }[];
}

/** Barra superior de las páginas de Fersua (index, legales, 404): la misma .nav de la plantilla. */
export function SiteNav({ tag = 'Booking', links }: Props) {
  const items = links ?? [{ href: '/', label: 'Artistas' }];
  return (
    <nav className="nav" aria-label="Principal">
      <div className="nav-left">
        <Link to="/" className="brand brand-link">
          Fersua Studio
        </Link>
        <div className="nav-tag">{tag}</div>
      </div>
      <div className="nav-links">
        {items.map((l) =>
          l.href.startsWith('#') ? (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ) : (
            <Link key={l.href} to={l.href}>
              {l.label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
