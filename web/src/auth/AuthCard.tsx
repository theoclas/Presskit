import type { ReactNode } from 'react';
import { PublicShell } from '../public/layouts/PublicShell';

interface Props {
  /** id del título (aria-labelledby de la tarjeta). */
  titleId: string;
  title: ReactNode;
  children: ReactNode;
}

/** Tarjeta de las páginas de cuenta (registro, recuperar, restablecer, verificar): look público. */
export function AuthCard({ titleId, title, children }: Props) {
  return (
    <PublicShell>
      <section className="auth-card" aria-labelledby={titleId}>
        <h1 id={titleId} className="auth-title">
          {title}
        </h1>
        {children}
      </section>
    </PublicShell>
  );
}

/** Mientras se resuelve la sesión o se carga algo antes del formulario. */
export function AuthStatusCard({ text }: { text: string }) {
  return (
    <PublicShell>
      <section className="auth-card" aria-busy="true">
        <p className="auth-status" role="status">
          {text}
        </p>
      </section>
    </PublicShell>
  );
}
