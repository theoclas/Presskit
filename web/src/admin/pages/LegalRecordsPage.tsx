import type { AdminLegalRecordDto, AdminLegalRecordListItemDto, LegalRecordState } from '@fersua/shared';
import { Alert, Button, Descriptions, Drawer, Input, Segmented, Skeleton, Space, Table, Tag, Typography, type TableProps } from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DOC_TYPE_LABELS } from '../../editor-kit/labels';
import { useSyncedState } from '../../lib/useSyncedState';
import { PAGE_SIZE, useLegalRecord, useLegalRecords, type LegalRecordFilters } from '../api';
import { LoadError, PageHeader } from '../components';
import { formatDate, formatDateTime } from '../format';
import { PROFILE_STATUS } from '../labels';
import { useIsMobile } from '../useIsMobile';

// Registro privado de oferentes (art. 53, Ley 1480 de 2011): el de los perfiles vigentes y el
// que se conserva 12 meses después de borrar un perfil. La lista nunca muestra documentos; el
// detalle sí, con step-up (contraseña + código), y el api deja cada consulta en la auditoría.

const STATE_PARAM: Record<LegalRecordState, string> = { active: 'activos', closed: 'conservados' };

const STATE_OPTIONS: { value: LegalRecordState; label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'closed', label: 'Conservados' },
];

function profileLabel(r: Pick<AdminLegalRecordListItemDto, 'displayName' | 'slug'>): string {
  return r.displayName || r.slug || 'Perfil sin nombre';
}

function useLegalRecordFilters(): [LegalRecordFilters, (patch: Partial<Record<string, string | null>>) => void] {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('pagina') ?? '1');
  const q = params.get('q')?.trim();
  const filters: LegalRecordFilters = {
    state: params.get('estado') === STATE_PARAM.closed ? 'closed' : 'active',
    ...(q ? { q } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  const update = (patch: Partial<Record<string, string | null>>) =>
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
  return [filters, update];
}

/** /admin/registros-legales */
export function LegalRecordsPage() {
  const [filters, update] = useLegalRecordFilters();
  const { data, error, isFetching, refetch } = useLegalRecords(filters);
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useSyncedState(filters.q ?? '');

  const closed = filters.state === 'closed';

  const columns: TableProps<AdminLegalRecordListItemDto>['columns'] = [
    {
      title: 'Perfil',
      key: 'profile',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{profileLabel(r)}</Typography.Text>
          {r.slug ? <Typography.Text type="secondary">/{r.slug}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: 'Nombre o razón social',
      dataIndex: 'legalName',
      render: (v: string) => <Typography.Text>{v}</Typography.Text>,
    },
    closed
      ? {
          title: 'Perfil borrado',
          dataIndex: 'closedAt',
          render: (v: string | null) => formatDate(v),
          responsive: ['md'],
        }
      : {
          title: 'Estado del perfil',
          dataIndex: 'profileStatus',
          render: (v: AdminLegalRecordListItemDto['profileStatus']) =>
            v ? <Tag color={PROFILE_STATUS[v].color}>{PROFILE_STATUS[v].label}</Tag> : '—',
          responsive: ['md'],
        },
    {
      title: 'Actualizado',
      dataIndex: 'updatedAt',
      render: (v: string) => formatDate(v),
      responsive: ['lg'],
    },
    ...(closed
      ? [
          {
            title: 'Se conserva hasta',
            dataIndex: 'purgeAt',
            render: (v: string | null) => formatDate(v),
            responsive: ['lg' as const],
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title="Registros legales" />
      <Typography.Paragraph type="secondary" style={{ maxWidth: 720 }}>
        Registro privado de oferentes (art. 53 de la Ley 1480 de 2011). Los de perfiles borrados se conservan 12 meses y
        luego se eliminan solos. Solo se entregan a quien contrató al DJ y quiere presentar una queja, o a una autoridad.
      </Typography.Paragraph>
      <div className="admin-filters">
        <Segmented<LegalRecordState>
          aria-label="Estado del registro"
          options={STATE_OPTIONS}
          value={filters.state}
          onChange={(v) => update({ estado: v === 'closed' ? STATE_PARAM.closed : null })}
        />
        <Input.Search
          aria-label="Buscar por perfil o nombre"
          placeholder="Perfil o nombre"
          allowClear
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => update({ q: v.trim() || null })}
          style={{ maxWidth: 320 }}
        />
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<AdminLegalRecordListItemDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: closed ? 'No hay registros conservados.' : 'No hay registros con estos filtros.' }}
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

      <LegalRecordDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function LegalRecordDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const { data, error, isPending, refetch } = useLegalRecord(id);
  return (
    <Drawer open={!!id} onClose={onClose} size={isMobile ? '100%' : 560} title="Registro legal" destroyOnHidden>
      <Alert
        type="warning"
        showIcon
        title="Esta consulta queda registrada en la auditoría."
        description="Para ver el documento, la dirección y los teléfonos te pediremos tu contraseña y el código de tu app."
        style={{ marginBottom: 16 }}
      />
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}
      {isPending && id ? <Skeleton active /> : null}
      {data === null ? (
        <Alert
          type="info"
          showIcon
          title="No confirmaste tu contraseña y tu código: los datos no se muestran."
          action={
            <Button size="small" onClick={() => void refetch()}>
              Confirmar
            </Button>
          }
        />
      ) : null}
      {data ? <LegalRecordDetails record={data} /> : null}
    </Drawer>
  );
}

/** Datos completos de un registro (también en la entrega de datos de una PQRS). Texto plano. */
export function LegalRecordDetails({ record }: { record: AdminLegalRecordDto }) {
  const phones = Array.isArray(record.phones) ? record.phones.filter((p) => typeof p === 'string' && p) : [];
  return (
    <Descriptions
      column={1}
      size="small"
      bordered
      items={[
        {
          key: 'profile',
          label: 'Perfil',
          children:
            record.profileId && record.state === 'active' ? (
              <Link to={`/admin/djs/${encodeURIComponent(record.profileId)}`}>{profileLabel(record)}</Link>
            ) : (
              profileLabel(record)
            ),
        },
        {
          key: 'state',
          label: 'Estado',
          children:
            record.state === 'closed' ? (
              <Tag color="default">Perfil borrado el {formatDate(record.closedAt)}</Tag>
            ) : record.profileStatus ? (
              <Tag color={PROFILE_STATUS[record.profileStatus].color}>{PROFILE_STATUS[record.profileStatus].label}</Tag>
            ) : (
              '—'
            ),
        },
        { key: 'legalName', label: 'Nombre o razón social', children: record.legalName },
        {
          key: 'doc',
          label: 'Documento',
          children: `${DOC_TYPE_LABELS[record.docType] ?? record.docType} ${record.docNumber}`,
        },
        { key: 'address', label: 'Dirección', children: record.address || '—' },
        { key: 'phones', label: 'Teléfonos', children: phones.length ? phones.join(' · ') : '—' },
        { key: 'created', label: 'Registrado', children: formatDateTime(record.createdAt) },
        { key: 'updated', label: 'Actualizado', children: formatDateTime(record.updatedAt) },
        ...(record.state === 'closed' && record.purgeAt
          ? [{ key: 'purge', label: 'Se conserva hasta', children: formatDate(record.purgeAt) }]
          : []),
      ]}
    />
  );
}
