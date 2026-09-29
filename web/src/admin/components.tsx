import { Alert, Button, Typography } from 'antd';
import type { ReactNode } from 'react';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { errorMessage } from './errors';

/** Título de cada página del admin (también fija document.title). */
export function PageHeader({ title, extra }: { title: string; extra?: ReactNode }) {
  usePageTitle(`${title} · Admin · ${SITE_NAME}`);
  return (
    <div className="admin-page-head">
      <h1 className="admin-page-title">{title}</h1>
      {extra ? <div>{extra}</div> : null}
    </div>
  );
}

/** Error al cargar una lista o un detalle, con botón para reintentar. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title="No pudimos cargar la información"
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            Reintentar
          </Button>
        ) : undefined
      }
      style={{ marginBottom: 16 }}
    />
  );
}

/** Texto enviado por terceros: siempre como texto plano (nunca HTML). */
export function PlainText({ children }: { children: string | null | undefined }) {
  if (!children) return <Typography.Text type="secondary">—</Typography.Text>;
  return <p className="admin-plain">{children}</p>;
}
