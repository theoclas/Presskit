import { CopyOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import {
  LIMITS,
  TICKET_STATUSES,
  TICKET_TYPES,
  type DiscloseDjInput,
  type DiscloseDjResultDto,
  type TicketDto,
  type TicketStatus,
  type TicketType,
  type UpdateTicketInput,
} from '@fersua/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useStepUp } from '../../auth/useStepUp';
import { http, stepUpHeaders } from '../../lib/http';
import { adminKeys, PAGE_SIZE, useTicket, useTickets, type TicketFilters } from '../api';
import { LoadError, PageHeader, PlainText } from '../components';
import { errorMessage, withStepUp } from '../errors';
import { formatDate, formatDateTime, mailtoLink } from '../format';
import { TICKET_STATUS, TICKET_TYPE } from '../labels';
import { useIsMobile } from '../useIsMobile';
import { LegalRecordDetails } from './LegalRecordsPage';

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
    ...(params.get('spam') === '1' ? { spam: 'true' as const } : {}),
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
          {t.isSpam ? <SpamTag /> : null}
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
        {/* El api lista el spam aparte: con la casilla se ve solo el spam. */}
        <Checkbox checked={!!filters.spam} onChange={(e) => update({ spam: e.target.checked ? '1' : null })}>
          Mostrar spam
        </Checkbox>
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<TicketDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: filters.spam ? 'No hay nada marcado como spam.' : 'No hay solicitudes con estos filtros.' }}
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

/** El api marca como spam lo que llega con señales de bot; no cuenta para las insignias. */
function SpamTag() {
  return (
    <Tag color="red" style={{ marginTop: 4, width: 'fit-content' }}>
      Spam
    </Tag>
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
  const stepUp = useStepUp();
  // Los datos entregados viven solo en este estado (nunca en la caché): al cerrar se descartan.
  const [disclosed, setDisclosed] = useState<DiscloseDjResultDto | null>(null);
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

  // Mismo PATCH que "Guardar": conserva el estado y la respuesta, solo cambia la marca.
  const toggleSpam = useMutation({
    mutationFn: async (isSpam: boolean) => {
      const body: UpdateTicketInput = { status: data.status, isSpam };
      return (await http.patch<TicketDto>(`/admin/tickets/${encodeURIComponent(data.id)}`, body)).data;
    },
    onSuccess: async (ticket, isSpam) => {
      message.success(isSpam ? 'Marcada como spam' : 'Ya no está marcada como spam');
      if (ticket && typeof ticket === 'object' && 'id' in ticket) client.setQueryData(adminKeys.ticket(ticket.id), ticket);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
        client.invalidateQueries({ queryKey: adminKeys.stats }),
      ]);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  // Sin useMutation a propósito: su resultado quedaría en la caché de mutaciones.
  const [disclosing, setDisclosing] = useState(false);
  // docs/diseno/11 §5.1: solo a quien contrató al DJ. La casilla es la constancia (el api la exige).
  const [verified, setVerified] = useState(false);
  const disclose = async () => {
    if (disclosing || !verified) return;
    setDisclosing(true);
    try {
      const body: DiscloseDjInput = { confirmed: true };
      const res = await withStepUp(stepUp, async (t) =>
        (
          await http.post<DiscloseDjResultDto>(`/admin/tickets/${encodeURIComponent(data.id)}/disclose-dj`, body, {
            headers: stepUpHeaders(t),
          })
        ).data,
      );
      if (!res) return;
      setDisclosed(res.value);
      // El api pasa la solicitud de «Abierta» a «En trámite»: el formulario no debe devolverla.
      if (form.getFieldValue('status') === 'OPEN') form.setFieldsValue({ status: 'IN_PROGRESS' });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
        client.invalidateQueries({ queryKey: adminKeys.ticket(data.id) }),
        client.invalidateQueries({ queryKey: adminKeys.stats }),
      ]);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setDisclosing(false);
    }
  };

  const mail = mailtoLink(data.email, `Radicado ${data.id}: ${data.subject}`);
  // Las mismas reglas del api (409): así el botón explica por qué no se puede todavía.
  const discloseBlocked = data.isSpam
    ? 'Está marcada como spam: revísala y usa «No es spam» antes de entregar datos.'
    : data.status === 'REJECTED'
      ? 'Está rechazada: cámbiala a «En trámite» si decides entregar los datos.'
      : null;

  return (
    <>
      {data.isSpam ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Marcada como spam"
          description="Llegó con señales de envío automático (el campo trampa para bots venía lleno) o la marcaste tú. Revísala antes de responder: si es real, usa «No es spam» y atiéndela como cualquier otra."
        />
      ) : null}
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
          <Button loading={toggleSpam.isPending} onClick={() => toggleSpam.mutate(!data.isSpam)}>
            {data.isSpam ? 'No es spam' : 'Marcar como spam'}
          </Button>
        </Space>
      </Form>

      {data.type === 'SOLICITUD_DATOS_DJ' ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            Datos del DJ (art. 53)
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Entrégalos solo si quien pide contrató al DJ y quiere presentar una queja. La entrega queda en la auditoría.
          </Typography.Paragraph>
          <BookingMatch count={data.matchingBookings} />
          {discloseBlocked ? (
            <Typography.Paragraph type="warning">{discloseBlocked}</Typography.Paragraph>
          ) : null}
          <Checkbox
            checked={verified}
            disabled={!!discloseBlocked}
            onChange={(e) => setVerified(e.target.checked)}
            style={{ marginBottom: 12 }}
          >
            Verifiqué que quien pide contrató al DJ (su correo coincide con una solicitud, o me mostró el número de
            solicitud, el contrato o la conversación)
          </Checkbox>
          <div>
            <Popconfirm
              title="¿Entregar los datos del DJ?"
              disabled={!!discloseBlocked || !verified}
              description="Te pediremos tu contraseña y el código de tu app."
              okText="Continuar"
              cancelText="Cancelar"
              onConfirm={() => void disclose()}
            >
              <Button icon={<SafetyCertificateOutlined />} loading={disclosing} disabled={!!discloseBlocked || !verified}>
                Entregar datos del DJ
              </Button>
            </Popconfirm>
          </div>
        </>
      ) : null}

      <DisclosedModal value={disclosed} ticket={data} onClose={() => setDisclosed(null)} />
    </>
  );
}

/** ¿Quien pide le mandó una solicitud de booking a este DJ con el mismo correo? (solo el conteo) */
function BookingMatch({ count }: { count: number | null | undefined }) {
  if (count === undefined || count === null) return null;
  if (count > 0) {
    return (
      <Alert
        type="success"
        showIcon
        style={{ marginBottom: 12 }}
        title={`El correo de quien pide coincide con ${count} solicitud${count === 1 ? '' : 'es'} de booking a este DJ.`}
      />
    );
  }
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      title="El correo de quien pide no coincide con ninguna solicitud de booking a este DJ."
      description="Antes de entregar, pídele una prueba de que lo contrató: el número de su solicitud, el contrato o la conversación."
    />
  );
}

/** Registro entregado y la respuesta lista para copiar. Se muestra una vez; al cerrar se descarta. */
function DisclosedModal({
  value,
  ticket,
  onClose,
}: {
  value: DiscloseDjResultDto | null;
  ticket: TicketDto;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const mail = mailtoLink(ticket.email, `Radicado ${ticket.id}: datos del DJ`);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.responseTemplate);
      message.success('Respuesta copiada');
    } catch {
      message.warning('No se pudo copiar. Selecciona el texto y cópialo a mano.');
    }
  };

  return (
    <Modal
      open={!!value}
      title="Datos del DJ para la respuesta"
      onCancel={onClose}
      width={640}
      destroyOnHidden
      footer={
        <Button type="primary" onClick={onClose}>
          Listo
        </Button>
      }
    >
      {value ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="Envía esta respuesta al correo del solicitante"
            description={`${ticket.name} · ${ticket.email}. Después marca la solicitud como resuelta y deja la constancia.`}
          />
          <LegalRecordDetails record={value.record} />
          <Input.TextArea
            aria-label="Respuesta para el solicitante"
            value={value.responseTemplate}
            readOnly
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
          <Space wrap>
            <Button icon={<CopyOutlined />} onClick={() => void copy()}>
              Copiar respuesta
            </Button>
            {mail ? (
              <Button icon={<MailOutlined />} href={mail}>
                Abrir correo
              </Button>
            ) : null}
          </Space>
        </Space>
      ) : null}
    </Modal>
  );
}
