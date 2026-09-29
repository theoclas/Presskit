import { LIMITS, type SessionDto } from '@fersua/shared';
import { App, Button, Card, Descriptions, Form, Input, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { changePasswordErrorMessage } from '../../auth/changePasswordErrors';
import { checkNewPassword, minPasswordLength } from '../../auth/passwordPolicy';
import { endLocalSession, http } from '../../lib/http';
import { PageHeader } from '../components';
import { errorMessage } from '../errors';
import { USER_ROLE } from '../labels';

interface PwValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/** /admin/cuenta — datos de la cuenta, cambio de contraseña y cierre de todas las sesiones. */
export function AccountPage() {
  const { user, setSession } = useAuth();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<PwValues>();
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  const min = minPasswordLength(user.role);

  const onChangePassword = async (v: PwValues) => {
    setSaving(true);
    try {
      const { data } = await http.post<SessionDto>('/auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      setSession(data);
      form.resetFields();
      message.success('Contraseña actualizada. Cerramos tus otras sesiones.');
    } catch (e) {
      const m = changePasswordErrorMessage(e);
      form.setFieldsValue({ currentPassword: '' });
      if (m.field === 'current') form.setFields([{ name: 'currentPassword', errors: [m.message] }]);
      else if (m.field === 'new') form.setFields([{ name: 'newPassword', errors: [m.message] }]);
      else message.error(m.message);
    } finally {
      setSaving(false);
    }
  };

  const onLogoutAll = () =>
    modal.confirm({
      title: '¿Cerrar todas las sesiones?',
      content: 'Se cerrará la sesión en todos tus dispositivos, incluido este. Tendrás que ingresar de nuevo.',
      okText: 'Cerrar todas',
      cancelText: 'Cancelar',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await http.post('/auth/logout-all');
          endLocalSession();
          navigate('/login', { replace: true });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  return (
    <>
      <PageHeader title="Mi cuenta" />
      <Space orientation="vertical" size="large" style={{ width: '100%', maxWidth: 640 }}>
        <Card size="small" title="Datos">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'user', label: 'Usuario', children: user.username },
              { key: 'email', label: 'Correo', children: user.email ?? '—' },
              { key: 'role', label: 'Rol', children: USER_ROLE[user.role] },
              {
                key: 'mfa',
                label: 'Verificación en dos pasos',
                children: user.mfaEnabled ? <Tag color="green">Activa</Tag> : <Tag color="red">No activa</Tag>,
              },
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            El código de verificación y los códigos de recuperación se cambian desde la consola del servidor
            (admin:reset-mfa).
          </Typography.Paragraph>
        </Card>

        <Card size="small" title="Cambiar contraseña">
          <Form<PwValues> form={form} layout="vertical" onFinish={onChangePassword} requiredMark={false}>
            {/* Para que el gestor de contraseñas asocie la nueva a esta cuenta. */}
            <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
            <Form.Item
              label="Contraseña actual"
              name="currentPassword"
              rules={[{ required: true, message: 'Escribe tu contraseña actual.' }]}
            >
              <Input.Password autoComplete="current-password" maxLength={LIMITS.user.passwordMax} />
            </Form.Item>
            <Form.Item
              label="Contraseña nueva"
              name="newPassword"
              extra={`Al menos ${min} caracteres, sin tu usuario y que no sea una contraseña común.`}
              dependencies={['currentPassword']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_, value: string | undefined) => {
                    const err = checkNewPassword(value ?? '', { username: user.username, role: user.role });
                    if (err) throw new Error(err);
                    if (value && value === getFieldValue('currentPassword')) {
                      throw new Error('La contraseña nueva debe ser distinta de la actual.');
                    }
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" maxLength={LIMITS.user.passwordMax} />
            </Form.Item>
            <Form.Item
              label="Repite la contraseña nueva"
              name="confirm"
              dependencies={['newPassword']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_, value: string | undefined) => {
                    if (value !== getFieldValue('newPassword')) throw new Error('Las contraseñas no coinciden.');
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" maxLength={LIMITS.user.passwordMax} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Guardar contraseña
            </Button>
          </Form>
        </Card>

        <Card size="small" title="Sesiones">
          <Typography.Paragraph type="secondary">
            Si ingresaste desde un equipo que no es tuyo o crees que alguien más tiene acceso, cierra todas las sesiones.
          </Typography.Paragraph>
          <Button danger onClick={onLogoutAll}>
            Cerrar todas las sesiones
          </Button>
        </Card>
      </Space>
    </>
  );
}
