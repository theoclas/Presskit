import type { AuditLogDto } from '@fersua/shared';
import { AutoComplete, DatePicker, Input, Select, Table, Tooltip, Typography, type TableProps } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PAGE_SIZE, useAuditLogs, useProfileOptions, type AuditFilters } from '../api';
import { auditActionLabel, auditTargetLabel } from '../auditLabels';
import { LoadError, PageHeader } from '../components';
import { formatDateTime } from '../format';
import { useIsMobile } from '../useIsMobile';

// Mismo alfabeto que valida el api: acción exacta o prefijo ('admin.user.' / 'admin.*').
const ACTION_RE = /^[a-z0-9_.]{1,48}\*?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CUID_RE = /^[a-z0-9]{20,32}$/;

const ACTION_PRESETS = [
  { value: 'admin.*', label: 'Todo lo del admin (admin.*)' },
  { value: 'admin.profile.', label: 'Perfiles (admin.profile.)' },
  { value: 'admin.user.', label: 'Usuarios (admin.user.)' },
  { value: 'admin.booking.', label: 'Solicitudes (admin.booking.)' },
  { value: 'admin.ticket.', label: 'PQRS y reportes (admin.ticket.)' },
  { value: 'admin.genre.', label: 'Géneros (admin.genre.)' },
  { value: 'auth.', label: 'Ingresos y contraseñas (auth.)' },
  { value: 'profile.', label: 'Cambios de los DJs (profile.)' },
];

/** Metadatos como JSON de texto plano (nunca HTML). */
function metadataText(meta: unknown): string {
  try {
    return JSON.stringify(meta, null, 2) ?? '';
  } catch {
    return String(meta);
  }
}

/** /admin/auditoria — quién hizo qué y cuándo. Solo lectura. */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const accion = params.get('accion');
  const actor = params.get('actor');
  const dj = params.get('dj');
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  const page = Number(params.get('pagina') ?? '1');
  const filters: AuditFilters = {
    ...(accion && ACTION_RE.test(accion) ? { action: accion } : {}),
    ...(actor ? { actor } : {}),
    ...(dj && CUID_RE.test(dj) ? { profileId: dj } : {}),
    ...(desde && DATE_RE.test(desde) ? { from: desde } : {}),
    ...(hasta && DATE_RE.test(hasta) ? { to: hasta } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  const { data, error, isFetching, refetch } = useAuditLogs(filters);
  const profiles = useProfileOptions();
  const isMobile = useIsMobile();
  const [actionText, setActionText] = useState(filters.action ?? '');
  const [actorText, setActorText] = useState(filters.actor ?? '');

  useEffect(() => setActionText(filters.action ?? ''), [filters.action]);
  useEffect(() => setActorText(filters.actor ?? ''), [filters.actor]);

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

  const applyAction = (v: string) => {
    const a = v.trim().toLowerCase();
    if (a && !ACTION_RE.test(a)) return;
    update({ accion: a || null });
  };

  const columns: TableProps<AuditLogDto>['columns'] = [
    { title: 'Fecha', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v), width: 200 },
    { title: 'Quién', dataIndex: 'actorUsername', render: (v: string | null) => v ?? 'sistema' },
    {
      title: 'Acción',
      dataIndex: 'action',
      // El código crudo queda en el tooltip: es lo que se escribe en el filtro de acción.
      render: (v: string) => (
        <Tooltip title={v}>
          <span>{auditActionLabel(v)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Sobre',
      key: 'target',
      responsive: ['md'],
      render: (_, r) =>
        r.targetType ? (
          <Typography.Text type="secondary" title={r.targetId ?? undefined}>
            {auditTargetLabel(r.targetType)}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: 'Perfil',
      dataIndex: 'profileId',
      responsive: ['lg'],
      render: (v: string | null) => (v ? (profiles.data?.find((p) => p.value === v)?.label ?? v) : '—'),
    },
  ];

  const actionInvalid = !!actionText.trim() && !ACTION_RE.test(actionText.trim().toLowerCase());

  return (
    <>
      <PageHeader title="Auditoría" />
      <div className="admin-filters">
        <AutoComplete
          aria-label="Acción"
          options={ACTION_PRESETS}
          value={actionText}
          onChange={(v: string) => setActionText(v)}
          onSelect={(v: string) => applyAction(v)}
          style={{ minWidth: 240 }}
          status={actionInvalid ? 'error' : undefined}
        >
          <Input.Search placeholder="Acción (p. ej. admin.user.)" allowClear maxLength={49} onSearch={applyAction} />
        </AutoComplete>
        <Input.Search
          aria-label="Usuario que hizo la acción"
          placeholder="Usuario"
          allowClear
          maxLength={64}
          value={actorText}
          onChange={(e) => setActorText(e.target.value)}
          onSearch={(v) => update({ actor: v.trim() || null })}
          style={{ maxWidth: 220 }}
        />
        <Select
          aria-label="Perfil"
          placeholder="Todos los perfiles"
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          loading={profiles.isPending}
          options={profiles.data ?? []}
          value={filters.profileId}
          onChange={(v?: string) => update({ dj: v ?? null })}
          style={{ minWidth: 200 }}
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
      </div>

      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}

      <Table<AuditLogDto>
        rowKey="id"
        size={isMobile ? 'small' : 'middle'}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching && !data}
        locale={{ emptyText: 'No hay registros con estos filtros.' }}
        expandable={{
          rowExpandable: (r) => r.metadata !== null && r.metadata !== undefined,
          expandedRowRender: (r) => <pre className="admin-json">{metadataText(r.metadata)}</pre>,
        }}
        pagination={{
          current: filters.page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: (p) => update({ pagina: p > 1 ? String(p) : null }),
        }}
        scroll={{ x: 'max-content' }}
      />
    </>
  );
}
