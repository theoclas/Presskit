import { DeleteOutlined, MailOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { BOOKING_STATUSES, type BookingListItemDto, type BookingStatus } from '@fersua/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatDate, formatDateTime, mailtoLink, waLink } from '../../admin/format';
import { BOOKING_STATUS } from '../../admin/labels';
import { useIsMobile } from '../../admin/useIsMobile';
import { useFeedback } from '../../editor-kit/feedback';
import { http } from '../../lib/http';
import { OWNER_BASE, panelKeys, useOwnerBooking, useOwnerBookings, type OwnerBookingFilters } from '../api';
import { LoadError, PanelPageHeader, PlainText } from '../components';
import { panelErrorMessage } from '../errors';

/** Pestañas de la bandeja (en plural); el estado de cada fila usa BOOKING_STATUS. */
export const INBOX_TABS: { key: BookingStatus; label: string }[] = [
  { key: 'NEW', label: 'Nuevas' },
  { key: 'READ', label: 'Leídas' },
  { key: 'ARCHIVED', label: 'Archivadas' },
  { key: 'SPAM', label: 'Spam' },
];

function isBookingStatus(v: string | null): v is BookingStatus {
  return !!v && (BOOKING_STATUSES as readonly string[]).includes(v);
}

/** Pestaña y página en la URL: el botón atrás y recargar dejan la misma vista. */
function useInboxFilters(): [OwnerBookingFilters, (patch: { estado?: BookingStatus; pagina?: number }) => void] {
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado');
  const page = Number(params.get('pagina') ?? '1');
  const filters: OwnerBookingFilters = {
    status: isBookingStatus(estado) ? estado : 'NEW',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  const update = (patch: { estado?: BookingStatus; pagina?: number }) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (patch.estado) {
          if (patch.estado === 'NEW') next.delete('estado');
          else next.set('estado', patch.estado);
          next.delete('pagina');
        }
        if (patch.pagina !== undefined) {
          if (patch.pagina > 1) next.set('pagina', String(patch.pagina));
          else next.delete('pagina');
        }
        return next;
      },
      { replace: true },
    );
  };
  return [filters, update];
}

/** /panel/solicitudes — bandeja de solicitudes de booking del perfil propio. */
export function BookingsPage() {
  const [filters, update] = useInboxFilters();
  const { data, error, isFetching, refetch } = useOwnerBookings(filters);
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState<string | null>(null);

  const columns: TableProps<BookingListItemDto>['columns'] = [
    {
      title: 'Recibida',
      dataIndex: 'createdAt',
      render: (v: string) => formatDateTime(v),
      width: 190,
      responsive: ['sm'],
    },
    {
      title: 'Contacto',
      key: 'contact',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{r.contactName}</Typography.Text>
          <Typography.Text type="secondary">{r.contactEmail ?? r.contactPhone ?? '—'}</Typography.Text>
          {isMobile ? <Typography.Text type="secondary">{formatDateTime(r.createdAt)}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: 'Evento',
      dataIndex: 'eventDate',
      render: (v: string | null) => formatDate(v),
      responsive: ['md'],
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      render: (s: BookingStatus) => <Tag color={BOOKING_STATUS[s].color}>{BOOKING_STATUS[s].label}</Tag>,
      width: 110,
      responsive: ['sm'],
    },
    {
      title: '',
      key: 'open',
      width: 80,
      fixed: 'right',
      render: (_, r) => (
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setOpenId(r.id);
          }}
        >
          Ver
        </Button>
      ),
    },
  ];

  const pageSize = data?.pageSize ?? 20;

  return (
    <>
      <PanelPageHeader title="Solicitudes" />
      <Typography.Paragraph type="secondary">
        Lo que te escriben desde el formulario de tu página. Responde directo por WhatsApp o por correo.
      </Typography.Paragraph>
      <Tabs
        activeKey={filters.status}
        onChange={(key) => update({ estado: key as BookingStatus })}
        items={INBOX_TABS.map((t) => ({ key: t.key, label: t.label }))}
      />

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<BookingListItemDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: emptyText(filters.status) }}
        rowClassName="panel-row-clickable"
        onRow={(r) => ({ onClick: () => setOpenId(r.id) })}
        pagination={{
          current: filters.page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: (p) => update({ pagina: p }),
        }}
        scroll={{ x: 'max-content' }}
      />

      <BookingDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function emptyText(status: BookingStatus): string {
  switch (status) {
    case 'NEW':
      return 'No tienes solicitudes nuevas.';
    case 'READ':
      return 'No hay solicitudes leídas.';
    case 'ARCHIVED':
      return 'No hay solicitudes archivadas.';
    case 'SPAM':
      return 'No hay solicitudes marcadas como spam.';
  }
}

function BookingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = useFeedback();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const { data, error, isPending, refetch } = useOwnerBooking(id);

  // Abrir la solicitud la marca como leída en el api: lista e insignia se refrescan.
  useEffect(() => {
    if (data) {
      void client.invalidateQueries({ queryKey: panelKeys.bookingsAll });
      void client.invalidateQueries({ queryKey: panelKeys.unread });
    }
  }, [data, client]);

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: panelKeys.bookingsAll }),
      client.invalidateQueries({ queryKey: panelKeys.unread }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: async (status: BookingStatus) => {
      await http.patch(`${OWNER_BASE}/bookings/${encodeURIComponent(id ?? '')}`, { status });
    },
    onSuccess: async () => {
      message.success('Estado actualizado');
      await Promise.all([invalidate(), client.invalidateQueries({ queryKey: panelKeys.booking(id ?? '') })]);
    },
    onError: (e) => message.error(panelErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await http.delete(`${OWNER_BASE}/bookings/${encodeURIComponent(id ?? '')}`);
    },
    onSuccess: async () => {
      message.success('Se quitó de tu bandeja');
      client.removeQueries({ queryKey: panelKeys.booking(id ?? '') });
      onClose();
      await invalidate();
    },
    onError: (e) => message.error(panelErrorMessage(e)),
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
              description="Se ocultará de tu bandeja. El administrador conserva una copia según la política de datos."
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
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="Usa estos datos solo para responder esta solicitud. No los agregues a listas de difusión."
          />
          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
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
              { key: 'name', label: 'Nombre', children: <PlainText>{data.contactName}</PlainText> },
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
          </Typography.Paragraph>
        </>
      ) : null}
    </Drawer>
  );
}
