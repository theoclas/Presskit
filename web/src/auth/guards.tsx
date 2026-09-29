import { isSafeNextPath, type UserRole } from '@fersua/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { loginUrlFor } from '../lib/http';
import { NotFoundPage } from '../public/pages/NotFoundPage';
import { useAuth } from './AuthProvider';

interface Props {
  /** Rol exigido. Otro rol ve la página 404 pública: no revela que la sección existe. */
  role?: UserRole;
  /** Mientras se resuelve la sesión (refresh silencioso). */
  fallback?: ReactNode;
  children: ReactNode;
}

/** Sin sesión -> /login?next=...; contraseña temporal pendiente -> /cambiar-clave. */
export function RequireAuth({ role, fallback = null, children }: Props) {
  const { status, user } = useAuth();
  const { pathname } = useLocation();

  if (status === 'loading') return <>{fallback}</>;
  if (status !== 'authenticated' || !user) return <Navigate to={loginUrlFor(pathname)} replace />;
  if (role && user.role !== role) return <NotFoundPage />;
  if (user.mustChangePassword) {
    const to = isSafeNextPath(pathname) ? `/cambiar-clave?next=${encodeURIComponent(pathname)}` : '/cambiar-clave';
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}
