import { DEFAULT_PALETTE, type ProfileStatus, type PublicDjProfileDto } from '@fersua/shared';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { RequireAuth } from '../../auth/guards';
import { apiError, http, shouldRetryHttp } from '../../lib/http';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { DjPublicView } from '../dj/DjPublicView';
import { LegalFooter } from '../legal/LegalFooter';
import { NotFoundPage } from './NotFoundPage';

// /_preview?profile=<id> (admin) — y en M3 /_preview sin parámetro para el dueño (/me/profile).
// Carga diferida dentro de AuthRoot: axios entra aquí, nunca en el bundle público.
// Sin antd: se ve igual que la página pública, con una franja arriba que avisa que es una vista previa.

const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const STATUS_TEXT: Record<ProfileStatus, string> = {
  DRAFT: 'Borrador: todavía no es pública.',
  PENDING_REVIEW: 'En revisión: todavía no es pública.',
  APPROVED: 'Aprobada: así está publicada ahora.',
  REJECTED: 'Rechazada: no es pública.',
  SUSPENDED: 'Suspendida: no es pública.',
};

const bannerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1000,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px 14px',
  padding: '10px 16px',
  background: 'rgba(2, 6, 23, 0.94)',
  borderBottom: '2px solid var(--accent, #f97316)',
  color: '#f9fafb',
  fontSize: 14,
  lineHeight: 1.4,
  textAlign: 'center',
  backdropFilter: 'blur(6px)',
};

const bannerButton: CSSProperties = {
  minHeight: 36,
  padding: '6px 14px',
  borderRadius: 999,
  border: '1px solid rgba(148, 163, 184, 0.6)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
};

/** Base del api según quién mira: el admin con ?profile=<id>; el dueño su propio perfil (M3). */
function previewBase(profileId: string | null): string {
  return profileId ? `/admin/profiles/${encodeURIComponent(profileId)}` : '/me/profile';
}

export function PreviewPage() {
  const [params] = useSearchParams();
  const profileId = params.get('profile');
  if (profileId !== null && !PROFILE_ID_RE.test(profileId)) return <NotFoundPage />;
  return (
    <RequireAuth role={profileId ? 'ADMIN' : 'USER'} fallback={<PreviewStatus text="Cargando vista previa…" />}>
      <PreviewContent profileId={profileId} />
    </RequireAuth>
  );
}

function PreviewStatus({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="djp">
      <div className="shell">
        <section className="page-panel" role={onRetry ? 'alert' : 'status'}>
          <p>{text}</p>
          {onRetry ? (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Reintentar
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function PreviewContent({ profileId }: { profileId: string | null }) {
  const base = previewBase(profileId);
  const query = useQuery({
    // Bajo la clave del editor: guardar en el editor (misma pestaña) la invalida.
    queryKey: ['editor', base, 'preview'],
    queryFn: async ({ signal }) => (await http.get<PublicDjProfileDto>(`${base}/preview`, { signal })).data,
    // Al volver a esta pestaña después de editar en la otra, se ve lo último guardado.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: shouldRetryHttp,
  });
  const dj = query.data;
  usePalette(dj?.palette ?? DEFAULT_PALETTE);
  usePageTitle(dj ? `Vista previa · ${dj.displayName} | ${SITE_NAME}` : `Vista previa | ${SITE_NAME}`);

  if (query.isPending) return <PreviewStatus text="Cargando vista previa…" />;
  if (query.isError || !dj) {
    const e = apiError(query.error);
    if (e.statusCode === 404 || e.statusCode === 403) return <NotFoundPage />;
    return <PreviewStatus text={e.message} onRetry={() => void query.refetch()} />;
  }

  const status = dj.preview?.status;
  return (
    <>
      <div role="status" aria-live="polite" style={bannerStyle}>
        <strong>Vista previa — así se verá la página</strong>
        {status ? <span>{STATUS_TEXT[status]}</span> : null}
        <span>El formulario no se envía.</span>
        <button
          type="button"
          style={bannerButton}
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-busy={query.isFetching || undefined}
        >
          {query.isFetching ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      <DjPublicView dj={dj} mode="preview" />
      <LegalFooter dj={{ slug: dj.slug, displayName: dj.displayName }} />
    </>
  );
}

export default PreviewPage;
