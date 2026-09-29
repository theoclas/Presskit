import { DEFAULT_PALETTE } from '@fersua/shared';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { PublicShell } from '../layouts/PublicShell';
import '../legal/legal.css';

/**
 * ErrorBoundary de las rutas públicas. Sin él, cualquier error de render (p. ej. un enlace
 * compartido con algo raro) deja la pantalla por defecto de React Router en inglés.
 * No muestra el error: puede traer datos internos.
 */
export function ErrorPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Algo salió mal · ${SITE_NAME}`);
  return (
    <PublicShell>
      <section className="page-panel" role="alert" aria-labelledby="err-title">
        <h1 id="err-title">Algo salió mal</h1>
        <p>No pudimos mostrar esta página. Vuelve a intentarlo en un momento.</p>
        {/* Enlace normal (no <Link>): recarga completa, por si el estado del cliente quedó dañado. */}
        <a className="btn btn-primary" href="/">
          Ir al inicio
        </a>
      </section>
    </PublicShell>
  );
}

export default ErrorPage;
