import { DEFAULT_PALETTE } from '@fersua/shared';
import { Link } from 'react-router';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { PublicShell } from '../layouts/PublicShell';
import '../legal/legal.css';

/** Ingreso, registro, panel y admin llegan en M2/M3. */
export function ComingSoonPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Próximamente · ${SITE_NAME}`);
  return (
    <PublicShell>
      <section className="page-panel" aria-labelledby="cs-title">
        <h1 id="cs-title">Próximamente</h1>
        <p>Esta sección estará disponible muy pronto.</p>
        <Link className="btn btn-secondary" to="/">
          Volver al inicio
        </Link>
      </section>
    </PublicShell>
  );
}

export default ComingSoonPage;
