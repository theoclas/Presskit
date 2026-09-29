import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { LIMITS, type GenreAdminDto } from '@fersua/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Typography, type TableProps } from 'antd';
import { useState } from 'react';
import { apiError, http } from '../../lib/http';
import { adminKeys, useGenres } from '../api';
import { LoadError, PageHeader } from '../components';
import { errorMessage } from '../errors';
import { useIsMobile } from '../useIsMobile';

type GenrePatch = Partial<Pick<GenreAdminDto, 'name' | 'isActive' | 'sortOrder'>>;

const NAME_MIN = LIMITS.genres.nameMin;

/** /admin/generos — catálogo que eligen los DJs y que filtra el index. */
export function GenresPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const { data, error, isPending, refetch } = useGenres();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<GenreAdminDto | null>(null);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: adminKeys.genres }),
      // El index y los filtros públicos muestran los géneros.
      client.invalidateQueries({ queryKey: ['public'] }),
      client.invalidateQueries({ queryKey: ['editor'] }),
    ]);

  const create = useMutation({
    mutationFn: async (name: string) => (await http.post<GenreAdminDto>('/admin/genres', { name })).data,
    onSuccess: async () => {
      setNewName('');
      message.success('Género creado');
      await refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: GenrePatch }) =>
      (await http.patch<GenreAdminDto>(`/admin/genres/${id}`, body)).data,
    onSuccess: async () => {
      message.success('Cambios guardados');
      await refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (g: GenreAdminDto) => {
      await http.delete(`/admin/genres/${g.id}`);
    },
    onSuccess: async () => {
      message.success('Género eliminado');
      await refresh();
    },
    onError: (e, g) => {
      // En uso: el api no lo borra; se ofrece desactivarlo (deja de aparecer para elegir).
      if (apiError(e).code === 'GENRE_IN_USE' && g.isActive) {
        modal.confirm({
          title: 'Este género está en uso',
          content: 'Algún perfil lo tiene elegido, así que no se puede borrar. ¿Quieres desactivarlo? Dejará de aparecer para elegir.',
          okText: 'Desactivar',
          cancelText: 'Cancelar',
          onOk: () => patch.mutateAsync({ id: g.id, body: { isActive: false } }).catch(() => undefined),
        });
        return;
      }
      message.error(errorMessage(e));
    },
  });

  const onCreate = () => {
    const name = newName.trim();
    if ([...name].length < NAME_MIN || [...name].length > LIMITS.genres.nameMax) {
      message.warning(`El nombre debe tener entre ${NAME_MIN} y ${LIMITS.genres.nameMax} caracteres.`);
      return;
    }
    create.mutate(name);
  };

  const columns: TableProps<GenreAdminDto>['columns'] = [
    { title: 'Nombre', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    {
      title: 'Identificador',
      dataIndex: 'slug',
      responsive: ['md'],
      render: (v: string) => <Typography.Text type="secondary">{v}</Typography.Text>,
    },
    { title: 'Perfiles', dataIndex: 'profiles', width: 90, align: 'right' },
    {
      title: 'Orden',
      dataIndex: 'sortOrder',
      width: 110,
      responsive: ['sm'],
      render: (v: number, g) => (
        <InputNumber
          // Con key: si el valor cambia en el servidor, el campo se vuelve a montar con el nuevo.
          key={`${g.id}-${v}`}
          aria-label={`Orden de ${g.name}`}
          size="small"
          min={0}
          max={99_999}
          precision={0}
          defaultValue={v}
          onBlur={(e) => {
            // Campo vacío = sin cambio (Number('') sería 0).
            if (!e.target.value.trim()) return;
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 0 && n !== v) patch.mutate({ id: g.id, body: { sortOrder: n } });
          }}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: 'Activo',
      dataIndex: 'isActive',
      width: 90,
      render: (v: boolean, g) => (
        <Switch
          aria-label={`${g.name} activo`}
          size="small"
          checked={v}
          loading={patch.isPending && patch.variables?.id === g.id}
          onChange={(checked) => patch.mutate({ id: g.id, body: { isActive: checked } })}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, g) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} aria-label={`Renombrar ${g.name}`} onClick={() => setEditing(g)} />
          <Popconfirm
            title={`¿Eliminar «${g.name}»?`}
            description={g.profiles > 0 ? 'Está en uso: te ofreceremos desactivarlo.' : 'Esta acción no se puede deshacer.'}
            okText="Eliminar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove.mutateAsync(g).catch(() => undefined)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Eliminar ${g.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Géneros" />
      <div className="admin-filters">
        <Space.Compact style={{ maxWidth: 420, width: '100%' }}>
          <Input
            aria-label="Nombre del género nuevo"
            placeholder="Nombre del género nuevo"
            maxLength={LIMITS.genres.nameMax}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={onCreate}
          />
          <Button type="primary" icon={<PlusOutlined />} loading={create.isPending} onClick={onCreate}>
            Agregar
          </Button>
        </Space.Compact>
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<GenreAdminDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data ?? []}
        loading={isPending}
        pagination={false}
        locale={{ emptyText: 'Todavía no hay géneros.' }}
        scroll={{ x: 'max-content' }}
      />

      <RenameModal
        genre={editing}
        saving={patch.isPending}
        onClose={() => setEditing(null)}
        onSave={(name) => {
          if (!editing) return;
          patch.mutate({ id: editing.id, body: { name } }, { onSuccess: () => setEditing(null) });
        }}
      />
    </>
  );
}

function RenameModal({
  genre,
  saving,
  onClose,
  onSave,
}: {
  genre: GenreAdminDto | null;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [form] = Form.useForm<{ name: string }>();
  return (
    <Modal
      open={!!genre}
      title="Renombrar género"
      okText="Guardar"
      cancelText="Cancelar"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">El slug no cambia, así los filtros y enlaces siguen funcionando.</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: genre?.name ?? '' }}
        onFinish={(v) => onSave(v.name.trim())}
        requiredMark={false}
        preserve={false}
      >
        <Form.Item
          label="Nombre"
          name="name"
          rules={[
            { required: true, whitespace: true, message: 'Escribe el nombre.' },
            { min: NAME_MIN, max: LIMITS.genres.nameMax, message: `Entre ${NAME_MIN} y ${LIMITS.genres.nameMax} caracteres.` },
          ]}
        >
          <Input maxLength={LIMITS.genres.nameMax} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
