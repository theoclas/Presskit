import { LEGAL_DOCS, LIMITS, type SessionDto } from '@fersua/shared';
import { Button, Card, Descriptions, Form, Input, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { changePasswordErrorMessage } from '../../auth/changePasswordErrors';
import { checkNewPassword, minPasswordLength } from '../../auth/passwordPolicy';
import { useFeedback } from '../../editor-kit/feedback';
import { endLocalSession, http } from '../../lib/http';
import { PanelPageHeader } from '../components';
import { panelErrorMessage } from '../errors';

interface PwValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/** /panel/cuenta — datos de la cuenta, cambio de contraseña y cierre de todas las sesiones. */
export function AccountPage() {
  const { user, setSession } = useAuth();
  const { message, modal } = useFeedback();
  const navigate = useNavigate();
  const [form] = Form.useForm<PwValues>();
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  const min = minPasswordLength(user.role);

  // El mismo flujo de /cambiar-clave: la respuesta trae una sesión nueva y cierra las otras.
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
          // Las sesiones ya se revocaron en el api: aquí solo se borra la local (sin otro POST).
          endLocalSession();
          navigate('/login', { replace: true });
        } catch (e) {
          message.error(panelErrorMessage(e));
        }
      },
    });

  return (
    <>
      <PanelPageHeader title="Cuenta" />
      <Space orientation="vertical" size="large" style={{ width: '100%', maxWidth: 640 }}>
        <Card size="small" title="Tus datos">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'user', label: 'Usuario', children: user.username },
              {
                key: 'email',
                label: 'Correo',
                children: user.email ? (
                  <Space wrap size={8}>
                    <span>{user.email}</span>
                    {user.emailVerified ? <Tag color="green">Confirmado</Tag> : <Tag color="orange">Sin confirmar</Tag>}
                  </Space>
                ) : (
                  '—'
                ),
              },
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            Para cambiar tu usuario o tu correo, escríbenos desde{' '}
            <a href={LEGAL_DOCS.pqrs.path} target="_blank" rel="noopener noreferrer">
              PQRS
            </a>
            .
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

        <Card size="small" title="Documentos legales">
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            {user.termsVersion
              ? `Aceptaste los términos (versión ${user.termsVersion})${user.privacyVersion ? ` y la política de datos (versión ${user.privacyVersion})` : ''}.`
              : 'Aún no registramos tu aceptación.'}
          </Typography.Paragraph>
          <Space wrap size={[16, 8]}>
            <a href={LEGAL_DOCS.artistTerms.path} target="_blank" rel="noopener noreferrer">
              {LEGAL_DOCS.artistTerms.title}
            </a>
            <a href={LEGAL_DOCS.privacy.path} target="_blank" rel="noopener noreferrer">
              Política de datos
            </a>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            Para consultar, corregir o borrar tus datos, o pedir que eliminemos tu cuenta, usa{' '}
            <a href={LEGAL_DOCS.pqrs.path} target="_blank" rel="noopener noreferrer">
              PQRS y Habeas Data
            </a>
            .
          </Typography.Paragraph>
        </Card>
      </Space>
    </>
  );
}
