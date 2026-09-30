import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, Result, Spin } from 'antd';
import { lazy, Suspense, useState } from 'react';
import { Link, Route, Routes } from 'react-router';
import { RequireAuth } from '../auth/guards';
import { StepUpProvider } from '../auth/useStepUp';
import { shouldRetryHttp } from '../lib/http';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { antdLocale, antdTheme } from '../theme/antdTheme';
import { AdminLayout } from './AdminLayout';
import { AccountPage } from './pages/AccountPage';
import { AuditPage } from './pages/AuditPage';
import { BookingsPage } from './pages/BookingsPage';
import { GenresPage } from './pages/GenresPage';
import { LegalRecordsPage } from './pages/LegalRecordsPage';
import { OverviewPage } from './pages/OverviewPage';
import { TicketsPage } from './pages/TicketsPage';
import { UsersPage } from './pages/UsersPage';

// El editor de perfiles es lo más pesado del admin (dnd-kit, recortes): chunk aparte.
const ProfilesSection = lazy(() => import('./profiles').then((m) => ({ default: m.ProfilesSection })));

function PageSpinner() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
      <Spin size="large" />
    </div>
  );
}

function AdminNotFound() {
  return (
    <Result
      status="404"
      title="Esta sección no existe"
      extra={<Link to="/admin">Volver al resumen</Link>}
    />
  );
}

/** Consultas del admin (y del editor): reintento solo ante red o 5xx, nunca ante un 4xx. */
function useAdminQueryDefaults() {
  const client = useQueryClient();
  useState(() => {
    for (const key of [['admin'], ['editor']]) {
      client.setQueryDefaults(key, { retry: shouldRetryHttp, refetchOnWindowFocus: false });
    }
    return true;
  });
}

/** /admin/* — va dentro de AuthRoot (AuthProvider). Un USER ve la 404 pública. */
export function AdminApp() {
  usePageTitle(`Admin · ${SITE_NAME}`);
  useAdminQueryDefaults();
  return (
    <RequireAuth role="ADMIN" fallback={<div className="admin-boot" role="status">Cargando…</div>}>
      <ConfigProvider theme={antdTheme} locale={antdLocale}>
        <AntApp>
          <StepUpProvider>
            <Routes>
              <Route element={<AdminLayout />}>
                <Route index element={<OverviewPage />} />
                <Route
                  path="djs/*"
                  element={
                    <Suspense fallback={<PageSpinner />}>
                      <ProfilesSection />
                    </Suspense>
                  }
                />
                <Route path="solicitudes" element={<BookingsPage />} />
                <Route path="pqrs" element={<TicketsPage />} />
                <Route path="registros-legales" element={<LegalRecordsPage />} />
                <Route path="usuarios" element={<UsersPage />} />
                <Route path="generos" element={<GenresPage />} />
                <Route path="auditoria" element={<AuditPage />} />
                <Route path="cuenta" element={<AccountPage />} />
                <Route path="*" element={<AdminNotFound />} />
              </Route>
            </Routes>
          </StepUpProvider>
        </AntApp>
      </ConfigProvider>
    </RequireAuth>
  );
}

export default AdminApp;
