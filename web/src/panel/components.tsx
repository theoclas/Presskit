import { Alert, Button, Typography } from 'antd';
import type { ReactNode } from 'react';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { panelErrorMessage } from './errors';

/** Título de cada página del panel (también fija document.title). */
export function PanelPageHeader({ title, extra, children }: { title: string; extra?: ReactNode; children?: ReactNode }) {
  usePageTitle(`${title} · Mi panel · ${SITE_NAME}`);
  return (
    <div className="panel-page-head">
      <div className="panel-page-head-row">
        <h1 className="panel-page-title">{title}</h1>
        {extra ? <div className="panel-page-extra">{extra}</div> : null}
      </div>
      {children ? <div className="panel-page-sub">{children}</div> : null}
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
      description={panelErrorMessage(error)}
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
  return <p className="panel-plain">{children}</p>;
}

export function PanelSpinner() {
  return (
    <div className="panel-boot" role="status">
      Cargando…
    </div>
  );
}
