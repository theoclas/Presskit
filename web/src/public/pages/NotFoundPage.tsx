import { DEFAULT_PALETTE } from '@fersua/shared';
import { Link } from 'react-router';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { PublicShell } from '../layouts/PublicShell';
import '../legal/legal.css';

export function NotFoundPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Página no encontrada · ${SITE_NAME}`);
  return (
    <PublicShell>
      <section className="page-panel" aria-labelledby="nf-title">
        <h1 id="nf-title">Página no encontrada</h1>
        {/* Genérico: esta página sale para cualquier URL desconocida, no solo para perfiles. */}
        <p>La página que buscas no existe o aún no está publicada.</p>
        <Link className="btn btn-primary" to="/">
          Ver todos los DJs
        </Link>
      </section>
    </PublicShell>
  );
}

export default NotFoundPage;
