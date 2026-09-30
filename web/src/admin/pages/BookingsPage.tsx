import { DeleteOutlined, EyeInvisibleOutlined, MailOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { BOOKING_STATUSES, type BookingListItemDto, type BookingStatus } from '@fersua/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { http } from '../../lib/http';
import { useSyncedState } from '../../lib/useSyncedState';
import { adminKeys, PAGE_SIZE, useBooking, useBookings, useProfileOptions, type BookingFilters } from '../api';
import { LoadError, PageHeader, PlainText } from '../components';
import { errorMessage } from '../errors';
import { formatDate, formatDateTime, mailtoLink, waLink } from '../format';
import { BOOKING_STATUS } from '../labels';
import { useIsMobile } from '../useIsMobile';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Un id con otra forma lo rechaza el api (400): se ignora en vez de mostrar un error.
const CUID_RE = /^[a-z0-9]{20,32}$/;

function isBookingStatus(v: string | null): v is BookingStatus {
  return !!v && (BOOKING_STATUSES as readonly string[]).includes(v);
}

/** Filtros en la URL: el enlace del resumen (?estado=NEW) y el botón atrás funcionan. */
function useBookingFilters(): [BookingFilters, (patch: Partial<Record<string, string | null>>) => void] {
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado');
  const dj = params.get('dj');
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  const page = Number(params.get('pagina') ?? '1');
  const filters: BookingFilters = {
    ...(dj && CUID_RE.test(dj) ? { profileId: dj } : {}),
    ...(isBookingStatus(estado) ? { status: estado } : {}),
    ...(params.get('q') ? { q: params.get('q') ?? undefined } : {}),
    ...(desde && DATE_RE.test(desde) ? { from: desde } : {}),
    ...(hasta && DATE_RE.test(hasta) ? { to: hasta } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  const update = (patch: Partial<Record<string, string | null>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        // Cambiar un filtro vuelve a la primera página.
        if (!('pagina' in patch)) next.delete('pagina');
        return next;
      },
      { replace: true },
    );
  };
  return [filters, update];
}

/** El DJ la borró de su bandeja: el admin conserva la copia hasta la purga de 12 meses. */
function OwnerDeletedTag() {
  return (
    <Tag color="default" icon={<EyeInvisibleOutlined />}>
      Oculta por el DJ
    </Tag>
  );
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todas (sin spam)' },
  ...BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS[s].label })),
];

/** /admin/solicitudes — solicitudes de booking de todos los DJs. */
export function BookingsPage() {
  const [filters, update] = useBookingFilters();
  const { data, error, isFetching, refetch } = useBookings(filters);
  const profiles = useProfileOptions();
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useSyncedState(filters.q ?? '');

  const columns: TableProps<BookingListItemDto>['columns'] = [
    {
      title: 'Recibida',
      dataIndex: 'createdAt',
      render: (v: string) => formatDateTime(v),
      width: 190,
    },
    {
      title: 'DJ',
      key: 'dj',
      render: (_, r) => r.profile.displayName,
      responsive: ['md'],
    },
    {
      title: 'Contacto',
      key: 'contact',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{r.contactName}</Typography.Text>
          <Typography.Text type="secondary">{r.contactEmail ?? r.contactPhone ?? '—'}</Typography.Text>
          {isMobile ? <Typography.Text type="secondary">{r.profile.displayName}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: 'Evento',
      dataIndex: 'eventDate',
      render: (v: string | null) => formatDate(v),
      responsive: ['lg'],
    },
    {
      title: 'Estado',
      key: 'status',
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag color={BOOKING_STATUS[r.status].color}>{BOOKING_STATUS[r.status].label}</Tag>
          {r.ownerDeleted ? <OwnerDeletedTag /> : null}
        </Space>
      ),
      width: 110,
    },
    {
      title: '',
      key: 'open',
      width: 80,
      // Siempre visible aunque la tabla se desplace de lado (móvil).
      fixed: 'right',
      render: (_, r) => (
        <Button size="small" onClick={() => setOpenId(r.id)}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Solicitudes" />
      <div className="admin-filters">
        <Select
          aria-label="DJ"
          placeholder="Todos los DJs"
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          loading={profiles.isPending}
          options={profiles.data ?? []}
          value={filters.profileId}
          onChange={(v?: string) => update({ dj: v ?? null })}
          style={{ minWidth: 200 }}
        />
        <Select
          aria-label="Estado"
          options={STATUS_OPTIONS}
          value={filters.status ?? ''}
          onChange={(v: string) => update({ estado: v || null })}
          style={{ minWidth: 170 }}
        />
        <DatePicker.RangePicker
          aria-label="Rango de fechas"
          allowEmpty={[true, true]}
          format="DD/MM/YYYY"
          value={[filters.from ? dayjs(filters.from) : null, filters.to ? dayjs(filters.to) : null]}
          onChange={(range) =>
            update({
              desde: range?.[0] ? range[0].format('YYYY-MM-DD') : null,
              hasta: range?.[1] ? range[1].format('YYYY-MM-DD') : null,
            })
          }
        />
        <Input.Search
          aria-label="Buscar por nombre, correo o teléfono"
          placeholder="Nombre, correo o teléfono"
          allowClear
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => update({ q: v.trim() || null })}
          style={{ maxWidth: 320 }}
        />
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<BookingListItemDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: 'No hay solicitudes con estos filtros.' }}
        rowClassName="admin-row-clickable"
        onRow={(r) => ({ onClick: () => setOpenId(r.id) })}
        pagination={{
          current: filters.page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: (p) => update({ pagina: p > 1 ? String(p) : null }),
        }}
        scroll={{ x: 'max-content' }}
      />

      <BookingDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function BookingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const { data, error, isPending, refetch } = useBooking(id);

  // Abrir una solicitud puede marcarla como leída en el api: la lista se refresca.
  useEffect(() => {
    if (data) void client.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  }, [data, client]);

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'bookings'] }),
      client.invalidateQueries({ queryKey: adminKeys.stats }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: async (status: BookingStatus) => {
      await http.patch(`/admin/bookings/${encodeURIComponent(id ?? '')}`, { status });
    },
    onSuccess: async () => {
      message.success('Estado actualizado');
      await Promise.all([invalidate(), client.invalidateQueries({ queryKey: adminKeys.booking(id ?? '') })]);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await http.delete(`/admin/bookings/${encodeURIComponent(id ?? '')}`);
    },
    onSuccess: async () => {
      message.success('Solicitud eliminada');
      client.removeQueries({ queryKey: adminKeys.booking(id ?? '') });
      onClose();
      await invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const wa = waLink(data?.contactPhone);
  const mail = mailtoLink(data?.contactEmail, data ? `Tu solicitud de booking para ${data.profile.displayName}` : undefined);

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={isMobile ? '100%' : 560}
      title="Detalle de la solicitud"
      destroyOnHidden
      footer={
        data ? (
          <Space wrap>
            {wa ? (
              <Button icon={<WhatsAppOutlined />} href={wa} target="_blank" rel="noopener noreferrer">
                Responder por WhatsApp
              </Button>
            ) : null}
            {mail ? (
              <Button icon={<MailOutlined />} href={mail}>
                Responder por correo
              </Button>
            ) : null}
            <Popconfirm
              title="¿Eliminar esta solicitud?"
              description="Esta acción no se puede deshacer."
              okText="Eliminar"
              cancelText="Cancelar"
              okButtonProps={{ danger: true, loading: remove.isPending }}
              onConfirm={() => remove.mutateAsync().catch(() => undefined)}
            >
              <Button danger icon={<DeleteOutlined />}>
                Eliminar
              </Button>
            </Popconfirm>
          </Space>
        ) : null
      }
    >
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}
      {isPending && id ? <Skeleton active /> : null}
      {data ? (
        <>
          {data.ownerDeleted ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title={<OwnerDeletedTag />}
              description="El DJ la quitó de su bandeja. Se conserva aquí hasta que se cumplan los 12 meses de la política de datos."
            />
          ) : null}
          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
              { key: 'dj', label: 'DJ', children: data.profile.displayName },
              { key: 'created', label: 'Recibida', children: formatDateTime(data.createdAt) },
              {
                key: 'status',
                label: 'Estado',
                children: (
                  <Select
                    aria-label="Estado de la solicitud"
                    size="small"
                    value={data.status}
                    options={BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS[s].label }))}
                    onChange={(s: BookingStatus) => setStatus.mutate(s)}
                    loading={setStatus.isPending}
                    style={{ minWidth: 140 }}
                  />
                ),
              },
              { key: 'name', label: 'Nombre', children: data.contactName },
              { key: 'email', label: 'Correo', children: data.contactEmail ?? '—' },
              { key: 'phone', label: 'Teléfono', children: data.contactPhone ?? '—' },
              { key: 'event', label: 'Fecha del evento', children: formatDate(data.eventDate) },
            ]}
          />

          <Typography.Title level={5} style={{ marginTop: 20 }}>
            Datos enviados
          </Typography.Title>
          {data.fields.length ? (
            <Descriptions
              column={1}
              size="small"
              bordered
              items={data.fields.map((f) => ({ key: f.key, label: f.label, children: <PlainText>{f.value}</PlainText> }))}
            />
          ) : (
            <Typography.Text type="secondary">La solicitud no trae más campos.</Typography.Text>
          )}

          <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
            Autorizó el tratamiento de sus datos el {formatDateTime(data.consentAt)} (política versión {data.consentVersion}).
            {data.readAt ? ` Leída por primera vez el ${formatDateTime(data.readAt)}.` : ''}
          </Typography.Paragraph>
        </>
      ) : null}
    </Drawer>
  );
}
