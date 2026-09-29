import { DEFAULT_PALETTE } from '@fersua/shared';
import { Link } from 'react-router';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { PublicShell } from '../layouts/PublicShell';
import '../legal/legal.css';

/**
 * /panel mientras llega el panel de DJs (M3). Un DJ con cuenta creada por el admin aterriza
 * aquí después de cambiar su contraseña temporal: se le dice que la cuenta está lista y quién
 * edita la página por ahora, en vez de un "Próximamente" que parece un error.
 */
export function PanelSoonPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Tu panel · ${SITE_NAME}`);
  return (
    <PublicShell>
      <section className="page-panel" aria-labelledby="panel-title">
        <h1 id="panel-title">Tu cuenta está lista</h1>
        <p>
          El panel para que edites tu página por tu cuenta llega muy pronto. Mientras tanto, el equipo de Fersua Studio la
          mantiene al día: si quieres cambiar algo (textos, fotos o fechas), escríbenos.
        </p>
        <Link className="btn btn-secondary" to="/">
          Volver al inicio
        </Link>
      </section>
    </PublicShell>
  );
}

export default PanelSoonPage;
