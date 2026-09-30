import { DownOutlined, PlusOutlined } from '@ant-design/icons';
import {
  LIMITS,
  USER_STATUSES,
  isValidEmail,
  normalizeEmail,
  normalizeUsername,
  validateUsername,
  type AdminUserDto,
  type TemporaryPasswordDto,
  type UserStatus,
} from '@fersua/shared';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown, Form, Input, Modal, Select, Space, Table, Tag, Typography, type MenuProps, type TableProps } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { useStepUp } from '../../auth/useStepUp';
import { http, stepUpHeaders } from '../../lib/http';
import { useSyncedState } from '../../lib/useSyncedState';
import { adminKeys, PAGE_SIZE, useUsers, type UserFilters } from '../api';
import { LoadError, PageHeader } from '../components';
import { errorMessage, withStepUp } from '../errors';
import { formatDateTime } from '../format';
import { PROFILE_STATUS, USER_ROLE, USER_STATUS } from '../labels';
import { TemporaryPasswordModal } from '../TemporaryPasswordModal';
import { useIsMobile } from '../useIsMobile';
import { suspendConsequence, tempPasswordExpired } from '../userRules';

const enc = encodeURIComponent;

function isLocked(u: AdminUserDto): boolean {
  return !!u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
}

function isUserStatus(v: string | null): v is UserStatus {
  return !!v && (USER_STATUSES as readonly string[]).includes(v);
}

/** /admin/usuarios — cuentas de DJ: alta con contraseña temporal, bloqueo, sesiones y borrado. */
export function UsersPage() {
  const { message, modal } = App.useApp();
  const { user: me } = useAuth();
  const stepUp = useStepUp();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado');
  const page = Number(params.get('pagina') ?? '1');
  const filters: UserFilters = {
    ...(params.get('q') ? { q: params.get('q') ?? undefined } : {}),
    ...(isUserStatus(estado) ? { status: estado } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  const { data, error, isFetching, refetch } = useUsers(filters);
  const [search, setSearch] = useSyncedState(filters.q ?? '');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminUserDto | null>(null);
  const [editingEmail, setEditingEmail] = useState<AdminUserDto | null>(null);
  // La contraseña temporal solo vive aquí, y se borra al cerrar el modal.
  const [tempPassword, setTempPassword] = useState<TemporaryPasswordDto | null>(null);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('pagina' in patch)) next.delete('pagina');
        return next;
      },
      { replace: true },
    );

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'users'] }),
      client.invalidateQueries({ queryKey: adminKeys.stats }),
      client.invalidateQueries({ queryKey: ['admin', 'profiles'] }),
    ]);

  const simpleAction = (u: AdminUserDto, path: string, done: string) => async () => {
    try {
      await http.post(`/admin/users/${enc(u.id)}/${path}`);
      message.success(done);
      await refresh();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const resetPassword = async (u: AdminUserDto) => {
    try {
      const res = await withStepUp(stepUp, async (t) =>
        (await http.post<TemporaryPasswordDto>(`/admin/users/${enc(u.id)}/reset-password`, undefined, { headers: stepUpHeaders(t) }))
          .data,
      );
      if (!res) return;
      setTempPassword(res.value);
      await refresh();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const confirmThen = (title: string, content: string, okText: string, run: () => Promise<void>, danger = false) =>
    modal.confirm({
      title,
      content,
      okText,
      cancelText: 'Cancelar',
      okButtonProps: danger ? { danger: true } : undefined,
      onOk: run,
    });

  const actionsFor = (u: AdminUserDto): MenuProps['items'] => {
    const locked = isLocked(u);
    return [
      {
        key: 'reset',
        label: 'Restablecer contraseña',
        onClick: () =>
          confirmThen(
            `¿Restablecer la contraseña de ${u.username}?`,
            'Se generará una contraseña temporal (vence en 72 horas) y se cerrarán todas sus sesiones.',
            'Restablecer',
            () => resetPassword(u),
          ),
      },
      u.status === 'ACTIVE'
        ? {
            key: 'suspend',
            label: 'Suspender cuenta',
            onClick: () =>
              confirmThen(
                `¿Suspender la cuenta de ${u.username}?`,
                suspendConsequence(u),
                'Suspender',
                simpleAction(u, 'suspend', 'Cuenta suspendida'),
                true,
              ),
          }
        : {
            key: 'reactivate',
            label: 'Reactivar cuenta',
            onClick: () => void simpleAction(u, 'reactivate', 'Cuenta reactivada')(),
          },
      ...(locked
        ? [{ key: 'unlock', label: 'Desbloquear ingreso', onClick: () => void simpleAction(u, 'unlock', 'Ingreso desbloqueado')() }]
        : []),
      { key: 'email', label: u.email ? 'Cambiar correo' : 'Agregar correo', onClick: () => setEditingEmail(u) },
      {
        key: 'revoke',
        label: 'Cerrar todas sus sesiones',
        onClick: () =>
          confirmThen(
            `¿Cerrar las sesiones de ${u.username}?`,
            'Tendrá que volver a ingresar en todos sus dispositivos.',
            'Cerrar sesiones',
            simpleAction(u, 'revoke-sessions', 'Sesiones cerradas'),
          ),
      },
      { type: 'divider' },
      { key: 'delete', label: 'Eliminar cuenta', danger: true, onClick: () => setDeleting(u) },
    ];
  };

  const columns: TableProps<AdminUserDto>['columns'] = [
    {
      title: 'Usuario',
      key: 'username',
      render: (_, u) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{u.username}</Typography.Text>
          <Typography.Text type="secondary">{u.email ?? 'Sin correo'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Rol',
      dataIndex: 'role',
      render: (r: AdminUserDto['role']) => USER_ROLE[r],
      responsive: ['md'],
    },
    {
      title: 'Estado',
      key: 'status',
      render: (_, u) => (
        <Space size={4} wrap>
          <Tag color={USER_STATUS[u.status].color}>{USER_STATUS[u.status].label}</Tag>
          {isLocked(u) ? <Tag color="orange">Bloqueada</Tag> : null}
          {tempPasswordExpired(u) ? (
            <Tag color="orange" title="Ya no sirve para entrar: usa «Restablecer contraseña» para generar otra.">
              Clave temporal vencida
            </Tag>
          ) : u.mustChangePassword ? (
            <Tag>Clave temporal</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Perfil DJ',
      key: 'profile',
      render: (_, u) =>
        u.profile ? (
          <Space size={4} wrap>
            <Link to={`/admin/djs/${enc(u.profile.id)}`}>{u.profile.slug}</Link>
            <Tag color={PROFILE_STATUS[u.profile.status].color}>{PROFILE_STATUS[u.profile.status].label}</Tag>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
      responsive: ['md'],
    },
    {
      title: 'Último ingreso',
      dataIndex: 'lastLoginAt',
      render: (v: string | null) => (v ? formatDateTime(v) : 'Nunca'),
      responsive: ['lg'],
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, u) => {
        // El admin no actúa sobre sí mismo ni sobre otra cuenta ADMIN (el api también lo impide).
        if (u.id === me?.id || u.role === 'ADMIN') return null;
        return (
          <Dropdown menu={{ items: actionsFor(u) }} trigger={['click']}>
            <Button size="small">
              Acciones <DownOutlined />
            </Button>
          </Dropdown>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Crear usuario
          </Button>
        }
      />
      <div className="admin-filters">
        <Select
          aria-label="Estado"
          value={filters.status ?? ''}
          options={[{ value: '', label: 'Todas las cuentas' }, ...USER_STATUSES.map((s) => ({ value: s, label: USER_STATUS[s].label }))]}
          onChange={(v: string) => update({ estado: v || null })}
          style={{ minWidth: 170 }}
        />
        <Input.Search
          aria-label="Buscar por usuario o correo"
          placeholder="Usuario o correo"
          allowClear
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => update({ q: v.trim() || null })}
          style={{ maxWidth: 320 }}
        />
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<AdminUserDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: 'No hay usuarios con estos filtros.' }}
        pagination={{
          current: filters.page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: (p) => update({ pagina: p > 1 ? String(p) : null }),
        }}
        scroll={{ x: 'max-content' }}
      />

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(res) => {
          setCreating(false);
          setTempPassword(res);
          void refresh();
        }}
      />

      <EmailModal
        user={editingEmail}
        onClose={() => setEditingEmail(null)}
        onSaved={() => {
          setEditingEmail(null);
          message.success('Correo actualizado');
          void refresh();
        }}
      />

      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onConfirmed={async (u, confirm) => {
          setDeleting(null);
          try {
            const res = await withStepUp(stepUp, (t) =>
              http.delete(`/admin/users/${enc(u.id)}`, { headers: stepUpHeaders(t), data: { confirm } }),
            );
            if (!res) return;
            message.success('Cuenta eliminada');
            await refresh();
          } catch (e) {
            message.error(errorMessage(e));
          }
        }}
      />

      <TemporaryPasswordModal value={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}

interface CreateValues {
  username: string;
  email?: string;
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (res: TemporaryPasswordDto) => void;
}) {
  const [form] = Form.useForm<CreateValues>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: CreateValues) => {
    setSending(true);
    setError(null);
    try {
      const email = values.email?.trim();
      // Sin useMutation a propósito: la respuesta trae la contraseña y no debe quedar en caché.
      const { data } = await http.post<TemporaryPasswordDto>('/admin/users', {
        username: normalizeUsername(values.username),
        email: email ? normalizeEmail(email) : null,
      });
      form.resetFields();
      onCreated(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Crear usuario"
      okText="Crear"
      cancelText="Cancelar"
      confirmLoading={sending}
      onOk={() => form.submit()}
      onCancel={() => {
        form.resetFields();
        setError(null);
        onClose();
      }}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Se crea una cuenta de DJ con una contraseña temporal que deberá cambiar al ingresar.
      </Typography.Paragraph>
      <Form<CreateValues> form={form} layout="vertical" onFinish={submit} requiredMark={false} autoComplete="off">
        <Form.Item
          label="Usuario"
          name="username"
          extra="De 3 a 24 caracteres: letras minúsculas, números, punto o guion bajo. Mejor que no sea igual al slug del perfil."
          rules={[
            {
              validator: async (_, v: string | undefined) => {
                const err = validateUsername(v ?? '');
                if (err === 'RESERVED') throw new Error('Ese nombre de usuario está reservado.');
                if (err) throw new Error('Revisa el formato del usuario.');
              },
            },
          ]}
        >
          <Input autoCapitalize="none" spellCheck={false} maxLength={LIMITS.user.usernameMax} />
        </Form.Item>
        <Form.Item
          label="Correo (opcional)"
          name="email"
          rules={[
            {
              validator: async (_, v: string | undefined) => {
                if (v && v.trim() && !isValidEmail(v.trim())) throw new Error('Revisa el correo.');
              },
            },
          ]}
        >
          <Input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={LIMITS.user.emailMax} />
        </Form.Item>
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
      </Form>
    </Modal>
  );
}

/** Cambiar o quitar el correo de una cuenta (con step-up: de él depende recuperar la contraseña). */
function EmailModal({ user, onClose, onSaved }: { user: AdminUserDto | null; onClose: () => void; onSaved: () => void }) {
  const stepUp = useStepUp();
  const [form] = Form.useForm<{ email?: string }>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Otro usuario (o el mismo al reabrir): el error del intento anterior no aplica.
  const [errorFor, setErrorFor] = useState(user);
  if (errorFor !== user) {
    setErrorFor(user);
    setError(null);
  }

  useEffect(() => {
    if (user) form.setFieldsValue({ email: user.email ?? '' });
  }, [user, form]);

  const submit = async (values: { email?: string }) => {
    if (!user) return;
    const email = values.email?.trim() ? normalizeEmail(values.email.trim()) : null;
    setSending(true);
    setError(null);
    try {
      const done = await withStepUp(stepUp, (t) =>
        http.patch<AdminUserDto>(`/admin/users/${enc(user.id)}`, { email }, { headers: stepUpHeaders(t) }),
      );
      if (done) onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={!!user}
      title={user ? `Correo de ${user.username}` : 'Correo'}
      okText="Guardar"
      cancelText="Cancelar"
      confirmLoading={sending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        A este correo llegan los avisos de la cuenta y, más adelante, la recuperación de la contraseña. Queda sin verificar
        y el correo anterior recibe un aviso del cambio. Déjalo vacío para quitarlo. Se pide tu contraseña y tu código.
      </Typography.Paragraph>
      <Form<{ email?: string }> form={form} layout="vertical" onFinish={submit} requiredMark={false} autoComplete="off">
        <Form.Item
          label="Correo"
          name="email"
          rules={[
            {
              validator: async (_, v: string | undefined) => {
                if (v && v.trim() && !isValidEmail(v.trim())) throw new Error('Revisa el correo.');
              },
            },
          ]}
        >
          <Input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={LIMITS.user.emailMax} />
        </Form.Item>
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
      </Form>
    </Modal>
  );
}

function DeleteUserModal({
  user,
  onClose,
  onConfirmed,
}: {
  user: AdminUserDto | null;
  onClose: () => void;
  onConfirmed: (u: AdminUserDto, confirm: string) => void;
}) {
  const [typed, setTyped] = useState('');
  // Cada cuenta se confirma desde cero: lo escrito para otra no cuenta.
  const [typedFor, setTypedFor] = useState(user);
  if (typedFor !== user) {
    setTypedFor(user);
    setTyped('');
  }
  const matches = !!user && typed.normalize('NFKC').trim().toLowerCase() === user.username;

  return (
    <Modal
      open={!!user}
      title="Eliminar cuenta"
      okText="Eliminar"
      cancelText="Cancelar"
      okButtonProps={{ danger: true, disabled: !matches }}
      onOk={() => user && matches && onConfirmed(user, typed.trim())}
      onCancel={onClose}
      destroyOnHidden
    >
      {user ? (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Paragraph>
            Se eliminará la cuenta <Typography.Text strong>{user.username}</Typography.Text> y se cerrarán sus sesiones.
            {user.profile ? ' Su perfil de DJ no se borra: queda sin dueño.' : ''} Esta acción no se puede deshacer.
          </Typography.Paragraph>
          {user.profile?.status === 'APPROVED' ? (
            <Typography.Paragraph type="warning">
              La página /{user.profile.slug} está aprobada: se suspende para que no quede publicada sin dueño. Puedes
              reactivarla después desde DJs → Estado.
            </Typography.Paragraph>
          ) : null}
          <Typography.Text>
            Escribe <Typography.Text code>{user.username}</Typography.Text> para confirmar:
          </Typography.Text>
          <Input
            aria-label="Usuario a eliminar"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
          />
        </Space>
      ) : null}
    </Modal>
  );
}
