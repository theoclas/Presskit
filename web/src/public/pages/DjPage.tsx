import { DEFAULT_PALETTE, SLUG_RE } from '@fersua/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { useDjProfile } from '../../app/queries';
import { qk } from '../../app/queryKeys';
import { ApiError } from '../../lib/publicApi';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { DjPublicView } from '../dj/DjPublicView';
import { LegalFooter } from '../legal/LegalFooter';
import { NotFoundPage } from './NotFoundPage';

/** '/MacflyMikebran.html' → 'macflymikebran' (el servidor ya hace el 301; esto cubre la navegación interna). */
export function normalizeSlugParam(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.html$/, '');
}

/**
 * Id de destino del #hash, o null. decodeURIComponent lanza con escapes rotos ('#%E0', '#%'):
 * un enlace así no puede tumbar la página, simplemente no hace scroll.
 */
export function hashTargetId(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Los ids de la plantilla son simples (fechas, booking, artistas…).
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

function DjSkeleton() {
  return (
    <div className="djp">
      <div className="shell">
        <div className="skel skel-nav" />
        <div className="hero skel-hero" role="status" aria-label="Cargando la página del DJ" />
        <div className="grid">
          <div className="skel skel-block" />
          <div className="skel skel-block" />
        </div>
      </div>
    </div>
  );
}

export function DjPage() {
  const { slug: raw = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const slug = normalizeSlugParam(raw);
  const needsRedirect = raw !== slug;
  const valid = !needsRedirect && SLUG_RE.test(slug);

  const query = useDjProfile(valid ? slug : null);
  const dj = query.data;
  usePalette(dj?.palette ?? DEFAULT_PALETTE);
  // Mismo formato que el <title> del shell (profileTitle en api/src/public/seo/head-builder.ts).
  usePageTitle(dj ? `${dj.displayName} — Booking | ${SITE_NAME}` : null);

  // Si el api respondió con otro slug (SlugRedirect, 301), la URL pasa al slug actual.
  useEffect(() => {
    if (!dj || dj.slug === slug || !SLUG_RE.test(dj.slug)) return;
    queryClient.setQueryData(qk.publicDj(dj.slug), dj);
    void navigate(`/${dj.slug}${location.search}${location.hash}`, { replace: true });
  }, [dj, slug, location.search, location.hash, navigate, queryClient]);

  // Al llegar con #fechas / #booking, el destino existe solo cuando cargan los datos.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!dj || dj.slug !== slug || !location.hash) return;
    const key = `${slug}${location.hash}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    const id = hashTargetId(location.hash);
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [dj, slug, location.hash]);

  if (needsRedirect) {
    return <Navigate to={`/${slug}${location.search}${location.hash}`} replace />;
  }
  if (!valid) return <NotFoundPage />;
  if (query.isPending) return <DjSkeleton />;
  if (query.isError || !dj) {
    const err = query.error;
    if (err instanceof ApiError && err.statusCode === 404) return <NotFoundPage />;
    return (
      <>
        <div className="djp">
          <div className="shell">
            <section className="page-panel" role="alert">
              <h1>No pudimos cargar la página</h1>
              <p>{err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.'}</p>
              <button type="button" className="btn btn-primary" onClick={() => void query.refetch()}>
                Reintentar
              </button>
            </section>
          </div>
        </div>
        <LegalFooter />
      </>
    );
  }

  return (
    <>
      <DjPublicView dj={dj} />
      <LegalFooter dj={{ slug: dj.slug, displayName: dj.displayName }} />
    </>
  );
}

export default DjPage;
