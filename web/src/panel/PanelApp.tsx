import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp, Button, ConfigProvider, Result, Spin } from 'antd';
import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/guards';
import { useEditorProfile } from '../editor-kit/api';
import { EditorScopeProvider } from '../editor-kit/scope';
import { UnsavedChangesProvider } from '../editor-kit/unsaved';
import { apiError, shouldRetryHttp } from '../lib/http';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { NotFoundPage } from '../public/pages/NotFoundPage';
import { antdLocale, antdTheme } from '../theme/antdTheme';
import { OWNER_BASE, OWNER_GENRES_URL, useUnreadCount } from './api';
import { LoadError, PanelSpinner } from './components';
import { PanelLayout } from './PanelLayout';
import { AccountPage } from './pages/AccountPage';
import { BookingsPage } from './pages/BookingsPage';
import type { EditorSectionKey } from './pages/EditorSectionPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SummaryPage } from './pages/SummaryPage';
import { TermsScreen } from './TermsScreen';
import './panel.css';

// Las secciones del editor (dnd-kit, recortes) van en su propio chunk.
const EditorSectionPage = lazy(() => import('./pages/EditorSectionPage').then((m) => ({ default: m.EditorSectionPage })));

const SECTION_KEYS: EditorSectionKey[] = ['perfil', 'fotos', 'integrantes', 'fechas', 'rider', 'redes', 'formulario', 'legal'];

function SectionSpinner() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
      <Spin size="large" />
    </div>
  );
}

/** Consultas del panel y del editor: reintento solo ante red o 5xx, nunca ante un 4xx. */
function usePanelQueryDefaults() {
  const client = useQueryClient();
  useState(() => {
    for (const key of [['panel'], ['editor']]) {
      client.setQueryDefaults(key, { retry: shouldRetryHttp, refetchOnWindowFocus: false });
    }
    return true;
  });
}

/**
 * Fondo oscuro del panel (el degradado de las páginas públicas no aplica aquí). Al abrir /panel
 * directo, PublicLayout se monta en el mismo commit y su layout effect (que corre después del
 * de sus hijos) vuelve a poner 'public': el effect pasivo corre después y lo deja en 'panel'.
 */
function usePanelSurface() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = 'panel';
    return () => {
      root.dataset.surface = 'public';
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.surface = 'panel';
  }, []);
}

/**
 * /panel/* — panel del DJ (rol USER). Va dentro de AuthRoot (AuthProvider).
 * Orden: sesión (o /login) → contraseña temporal (/cambiar-clave) → rol (el admin va a /admin)
 * → términos vigentes → perfil (onboarding si no tiene) → secciones.
 */
export function PanelApp() {
  usePageTitle(`Mi panel · ${SITE_NAME}`);
  usePanelQueryDefaults();
  usePanelSurface();
  return (
    <RequireAuth fallback={<PanelSpinner />}>
      <ConfigProvider theme={antdTheme} locale={antdLocale}>
        <AntApp>
          <PanelRoleGate />
        </AntApp>
      </ConfigProvider>
    </RequireAuth>
  );
}

function PanelRoleGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user.role !== 'USER') return <NotFoundPage />;
  if (user.termsOutdated) return <TermsScreen />;
  return (
    <EditorScopeProvider base={OWNER_BASE} actor="owner" genresUrl={OWNER_GENRES_URL}>
      <UnsavedChangesProvider>
        <PanelShell />
      </UnsavedChangesProvider>
    </EditorScopeProvider>
  );
}

function PanelShell() {
  const { refreshMe } = useAuth();
  const profileQuery = useEditorProfile();
  const error = profileQuery.isError ? apiError(profileQuery.error) : null;
  const noProfile = !!error && (error.code === 'NO_PROFILE' || (error.statusCode === 404 && error.code === 'NOT_FOUND'));
  const profile = profileQuery.data;
  const hasProfile = !!profile && !noProfile;
  const unread = useUnreadCount(hasProfile);

  if (profileQuery.isPending) return <PanelSpinner />;

  // Los términos cambiaron mientras la sesión estaba abierta: MeDto aún no lo sabía.
  if (error?.code === 'TERMS_ACCEPTANCE_REQUIRED') {
    return <TermsScreen onAccepted={() => void profileQuery.refetch()} />;
  }

  let routes: ReactNode;
  if (hasProfile && profile) {
    routes = (
      <>
        <Route index element={<SummaryPage profile={profile} />} />
        {SECTION_KEYS.map((key) => (
          <Route
            key={key}
            path={key}
            element={
              <Suspense fallback={<SectionSpinner />}>
                <EditorSectionPage section={key} profile={profile} />
              </Suspense>
            }
          />
        ))}
        <Route path="solicitudes" element={<BookingsPage />} />
        <Route path="cuenta" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </>
    );
  } else if (noProfile) {
    routes = (
      <>
        <Route index element={<OnboardingPage />} />
        <Route path="crear" element={<OnboardingPage />} />
        <Route path="cuenta" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </>
    );
  } else {
    routes = (
      <>
        <Route path="cuenta" element={<AccountPage />} />
        <Route
          path="*"
          element={
            error?.statusCode === 403 ? (
              <Result
                status="403"
                title="No puedes abrir tu panel ahora"
                subTitle={error.message}
                extra={<Button onClick={() => void refreshMe().then(() => profileQuery.refetch())}>Reintentar</Button>}
              />
            ) : (
              <LoadError error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
            )
          }
        />
      </>
    );
  }

  return (
    <Routes>
      <Route element={<PanelLayout hasProfile={hasProfile} unread={unread.data?.count ?? 0} />}>{routes}</Route>
    </Routes>
  );
}

export default PanelApp;
