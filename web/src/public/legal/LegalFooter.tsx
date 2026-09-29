import { CONTACT_PORTAL_NOTICE, LEGAL_DOCS } from '@fersua/shared';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { PlaceholderText } from '../components/PlaceholderText';
import { OPERATOR } from './operator';

interface Props {
  /** En la página de un DJ: aviso de plataforma y "Reportar este perfil". */
  dj?: { slug: string; displayName: string } | null;
}

const LINKS: { to: string; label: string }[] = [
  { to: LEGAL_DOCS.terms.path, label: 'Términos' },
  { to: LEGAL_DOCS.privacy.path, label: 'Política de datos' },
  { to: LEGAL_DOCS.pqrs.path, label: 'PQRS' },
  { to: '/reportar', label: 'Reportar contenido' },
];

/**
 * Pie legal de todas las páginas públicas. Va fuera de .djp: ni la paleta ni los textos
 * del DJ pueden ocultarlo o cambiarlo.
 */
export function LegalFooter({ dj }: Props) {
  const identity = [
    OPERATOR.brand,
    `${OPERATOR.docLabel} ${OPERATOR.docNumber}`,
    OPERATOR.address,
    OPERATOR.email,
  ].join(' · ');
  return (
    <footer className="legal-footer">
      {dj ? (
        <p className="legal-footer-dj">
          {/* Aquí también (no solo en el formulario): si el DJ apaga el formulario, la página
              sigue diciendo que Fersua es un portal de contacto. Fuera de .djp: no se puede ocultar. */}
          {CONTACT_PORTAL_NOTICE}
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <Link to={`/reportar?perfil=${encodeURIComponent(dj.slug)}`}>Reportar este perfil</Link>
        </p>
      ) : null}
      <nav aria-label="Información legal">
        {LINKS.map((l) => (
          <Fragment key={l.to}>
            <Link to={l.to}>{l.label}</Link>
            <span className="sep" aria-hidden="true">
              ·
            </span>
          </Fragment>
        ))}
        <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer">
          www.sic.gov.co
        </a>
      </nav>
      <p>
        <PlaceholderText text={identity} />
      </p>
    </footer>
  );
}
