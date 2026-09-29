import { Button, Space, Typography } from 'antd';

interface Props {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  disabled?: boolean;
  /** Pegada al borde inferior (formularios largos). */
  sticky?: boolean;
}

/** Barra de guardado de una sección: guardar explícito, nunca automático. */
export function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel = 'Guardar cambios', disabled, sticky = false }: Props) {
  return (
    <div
      style={{
        position: sticky ? 'sticky' : 'static',
        bottom: 0,
        zIndex: 5,
        padding: '12px 0',
        marginTop: 8,
        background: sticky ? 'var(--ant-color-bg-layout, rgba(2,6,23,.92))' : undefined,
        borderTop: sticky ? '1px solid rgba(148,163,184,.25)' : undefined,
      }}
    >
      <Space wrap>
        <Button type="primary" onClick={onSave} loading={saving} disabled={disabled || (!dirty && !saving)}>
          {saveLabel}
        </Button>
        {onDiscard ? (
          <Button onClick={onDiscard} disabled={!dirty || saving}>
            Descartar cambios
          </Button>
        ) : null}
        <Typography.Text type="secondary" aria-live="polite">
          {dirty ? 'Tienes cambios sin guardar.' : ''}
        </Typography.Text>
      </Space>
    </div>
  );
}
