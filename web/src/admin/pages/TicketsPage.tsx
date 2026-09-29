import { MailOutlined } from '@ant-design/icons';
import {
  LIMITS,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketDto,
  type TicketStatus,
  type TicketType,
  type UpdateTicketInput,
} from '@fersua/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Descriptions, Drawer, Form, Input, Select, Skeleton, Space, Table, Tag, Typography, type TableProps } from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { http } from '../../lib/http';
import { adminKeys, PAGE_SIZE, useTicket, useTickets, type TicketFilters } from '../api';
import { LoadError, PageHeader, PlainText } from '../components';
import { errorMessage } from '../errors';
import { formatDate, formatDateTime, mailtoLink } from '../format';
import { TICKET_STATUS, TICKET_TYPE } from '../labels';
import { useIsMobile } from '../useIsMobile';

const CLOSED: ReadonlySet<TicketStatus> = new Set(['RESOLVED', 'REJECTED']);

/** Plazo legal: vencido en rojo, 3 días hábiles o menos en naranja. */
export function DueBadge({ ticket }: { ticket: Pick<TicketDto, 'status' | 'businessDaysLeft' | 'dueAt'> }) {
  if (CLOSED.has(ticket.status)) return <Typography.Text type="secondary">{formatDate(ticket.dueAt)}</Typography.Text>;
  const d = ticket.businessDaysLeft;
  if (d < 0) {
    const n = Math.abs(d);
    return <Tag color="red">Vencido hace {n} día{n === 1 ? '' : 's'} hábil{n === 1 ? '' : 'es'}</Tag>;
  }
  if (d === 0) return <Tag color="orange">Vence hoy</Tag>;
  if (d <= 3) return <Tag color="orange">{d} día{d === 1 ? '' : 's'} hábil{d === 1 ? '' : 'es'}</Tag>;
  return <Tag>{formatDate(ticket.dueAt)}</Tag>;
}

function isStatus(v: string | null): v is TicketStatus {
  return !!v && (TICKET_STATUSES as readonly string[]).includes(v);
}
function isType(v: string | null): v is TicketType {
  return !!v && (TICKET_TYPES as readonly string[]).includes(v);
}

/** /admin/pqrs — PQRS (Ley 1581) y reportes de perfiles, con su plazo de respuesta. */
export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado');
  const tipo = params.get('tipo');
  const page = Number(params.get('pagina') ?? '1');
  const filters: TicketFilters = {
    ...(isStatus(estado) ? { status: estado } : {}),
    ...(isType(tipo) ? { type: tipo } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  const { data, error, isFetching, refetch } = useTickets(filters);
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState<string | null>(null);

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

  const columns: TableProps<TicketDto>['columns'] = [
    {
      title: 'Plazo',
      key: 'due',
      render: (_, t) => <DueBadge ticket={t} />,
      width: 190,
    },
    {
      title: 'Tipo',
      dataIndex: 'type',
      render: (t: TicketType) => TICKET_TYPE[t],
      responsive: ['md'],
    },
    {
      title: 'Asunto',
      key: 'subject',
      render: (_, t) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong ellipsis style={{ maxWidth: 320 }}>
            {t.subject}
          </Typography.Text>
          <Typography.Text type="secondary">{t.name}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Perfil',
      key: 'profile',
      render: (_, t) => t.profile?.displayName ?? t.profileSlug ?? '—',
      responsive: ['lg'],
    },
    {
      title: 'Recibida',
      dataIndex: 'createdAt',
      render: (v: string) => formatDateTime(v),
      responsive: ['lg'],
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      render: (s: TicketStatus) => <Tag color={TICKET_STATUS[s].color}>{TICKET_STATUS[s].label}</Tag>,
      width: 120,
    },
    {
      title: '',
      key: 'open',
      width: 80,
      fixed: 'right',
      render: (_, t) => (
        <Button size="small" onClick={() => setOpenId(t.id)}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="PQRS y reportes" />
      <div className="admin-filters">
        <Select
          aria-label="Estado"
          value={filters.status ?? ''}
          options={[{ value: '', label: 'Todos los estados' }, ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))]}
          onChange={(v: string) => update({ estado: v || null })}
          style={{ minWidth: 170 }}
        />
        <Select
          aria-label="Tipo"
          value={filters.type ?? ''}
          options={[{ value: '', label: 'Todos los tipos' }, ...TICKET_TYPES.map((t) => ({ value: t, label: TICKET_TYPE[t] }))]}
          onChange={(v: string) => update({ tipo: v || null })}
          style={{ minWidth: 200 }}
        />
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<TicketDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: 'No hay solicitudes con estos filtros.' }}
        rowClassName="admin-row-clickable"
        onRow={(t) => ({ onClick: () => setOpenId(t.id) })}
        pagination={{
          current: filters.page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: (p) => update({ pagina: p > 1 ? String(p) : null }),
        }}
        scroll={{ x: 'max-content' }}
      />

      <TicketDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

interface FormValues {
  status: TicketStatus;
  resolution: string;
}

function TicketDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const { data, error, isPending, refetch } = useTicket(id);
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={isMobile ? '100%' : 600}
      title={data ? `Radicado ${data.id}` : 'Detalle'}
      destroyOnHidden
    >
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}
      {isPending && id ? <Skeleton active /> : null}
      {data ? <TicketDetail key={data.id} ticket={data} /> : null}
    </Drawer>
  );
}

function TicketDetail({ ticket: data }: { ticket: TicketDto }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const status = Form.useWatch('status', form);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const resolution = (values.resolution ?? '').trim();
      const body: UpdateTicketInput = { status: values.status, resolution: resolution || null };
      return (await http.patch<TicketDto>(`/admin/tickets/${encodeURIComponent(data.id)}`, body)).data;
    },
    onSuccess: async (ticket) => {
      message.success('Cambios guardados');
      if (ticket && typeof ticket === 'object' && 'id' in ticket) client.setQueryData(adminKeys.ticket(ticket.id), ticket);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
        client.invalidateQueries({ queryKey: adminKeys.ticket(data.id) }),
        client.invalidateQueries({ queryKey: adminKeys.stats }),
      ]);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const mail = mailtoLink(data.email, `Radicado ${data.id}: ${data.subject}`);

  return (
    <>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: 'type', label: 'Tipo', children: TICKET_TYPE[data.type] },
          { key: 'status', label: 'Estado', children: <Tag color={TICKET_STATUS[data.status].color}>{TICKET_STATUS[data.status].label}</Tag> },
          { key: 'created', label: 'Recibida', children: formatDateTime(data.createdAt) },
          { key: 'due', label: 'Plazo', children: <DueBadge ticket={data} /> },
          { key: 'name', label: 'Nombre', children: data.name },
          {
            key: 'email',
            label: 'Correo',
            children: mail ? (
              <a href={mail}>
                <MailOutlined /> {data.email}
              </a>
            ) : (
              data.email
            ),
          },
          { key: 'phone', label: 'Teléfono', children: data.phone ?? '—' },
          {
            key: 'profile',
            label: 'Perfil',
            children: data.profile ? (
              <Space wrap>
                <Link to={`/admin/djs/${encodeURIComponent(data.profile.id)}`}>{data.profile.displayName}</Link>
                <a href={`/${encodeURIComponent(data.profile.slug)}`} target="_blank" rel="noopener noreferrer">
                  Ver página
                </a>
              </Space>
            ) : (
              (data.profileSlug ?? '—')
            ),
          },
          { key: 'subject', label: 'Asunto', children: <PlainText>{data.subject}</PlainText> },
          { key: 'message', label: 'Mensaje', children: <PlainText>{data.message}</PlainText> },
          ...(data.resolvedAt
            ? [{ key: 'resolved', label: 'Cerrada', children: formatDateTime(data.resolvedAt) }]
            : []),
        ]}
      />

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Respuesta
      </Typography.Title>
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={{ status: data.status, resolution: data.resolution ?? '' }}
        onFinish={(v) => save.mutate(v)}
        requiredMark={false}
      >
        <Form.Item label="Estado" name="status" rules={[{ required: true }]}>
          <Select options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))} />
        </Form.Item>
        <Form.Item
          label="Resolución (queda como constancia de la respuesta)"
          name="resolution"
          dependencies={['status']}
          rules={[
            ({ getFieldValue }) => ({
              validator: async (_, value: string | undefined) => {
                const next = getFieldValue('status') as TicketStatus | undefined;
                if (next && CLOSED.has(next) && !value?.trim()) {
                  throw new Error('Escribe la respuesta antes de cerrar la solicitud.');
                }
              },
            }),
          ]}
          extra={status && CLOSED.has(status) ? 'Obligatoria para cerrar la solicitud.' : undefined}
        >
          <Input.TextArea rows={5} maxLength={LIMITS.ticket.resolutionMax} showCount />
        </Form.Item>
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            Guardar
          </Button>
          {mail ? (
            <Button icon={<MailOutlined />} href={mail}>
              Responder por correo
            </Button>
          ) : null}
        </Space>
      </Form>
    </>
  );
}
