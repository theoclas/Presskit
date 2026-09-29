import { CopyOutlined } from '@ant-design/icons';
import type { TemporaryPasswordDto } from '@fersua/shared';
import { Alert, App, Button, Modal, Space, Typography } from 'antd';
import { formatDateTime } from './format';

interface Props {
  /** La respuesta del api. Al cerrar, quien la guarda debe borrarla (se muestra una sola vez). */
  value: TemporaryPasswordDto | null;
  onClose: () => void;
}

/**
 * Contraseña temporal de un usuario nuevo o restablecido. Se muestra una sola vez: vive solo
 * en el estado del componente que la pidió (nunca en la caché de TanStack Query) y al cerrar
 * se descarta.
 */
export function TemporaryPasswordModal({ value, onClose }: Props) {
  const { message } = App.useApp();

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.temporaryPassword);
      message.success('Contraseña copiada');
    } catch {
      message.warning('No se pudo copiar. Selecciónala y cópiala a mano.');
    }
  };

  return (
    <Modal
      open={!!value}
      title="Contraseña temporal"
      onCancel={onClose}
      mask={{ closable: false }}
      keyboard={false}
      destroyOnHidden
      footer={
        <Button type="primary" onClick={onClose}>
          Ya la copié
        </Button>
      }
    >
      {value ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            title="No se volverá a mostrar"
            description="Cópiala ahora y entrégasela al DJ por un canal privado (no por un grupo). Al ingresar tendrá que cambiarla."
          />
          <Typography.Text>
            Usuario: <Typography.Text strong>{value.username}</Typography.Text>
          </Typography.Text>
          <code className="admin-temp-password" data-testid="temp-password">
            {value.temporaryPassword}
          </code>
          <Button icon={<CopyOutlined />} onClick={() => void copy()}>
            Copiar contraseña
          </Button>
          <Typography.Text type="secondary">Vence el {formatDateTime(value.expiresAt)}.</Typography.Text>
        </Space>
      ) : null}
    </Modal>
  );
}
