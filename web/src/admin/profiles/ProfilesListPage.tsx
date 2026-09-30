import type { AdminProfileListItemDto, ProfileStatus } from '@fersua/shared';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Dropdown,
  Input,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  type MenuProps,
  type TableColumnsType,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useFeedback } from '../../editor-kit/feedback';
import { ImageThumb } from '../../editor-kit/media';
import { http } from '../../lib/http';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { useAdminStats } from '../api';
import { errorMessage } from '../errors';
import { formatDate } from '../format';
import { PROFILE_STATUS } from '../labels';
import { adminProfileBase, PROFILES_PAGE_SIZE, useAdminProfiles, useRefreshProfile } from './api';
import { NewProfileModal } from './NewProfileModal';
import { openInNewTab, openPublicPage } from './openInNewTab';
import { allowedActions, useProfileActions, type ProfileAction } from './useProfileActions';
import { hiddenByOwner } from './visibility';

type Filter = ProfileStatus | 'ALL';

const FILTERS: { value: Filter; label: string; stat?: ProfileStatus }[] = [
  { value: 'PENDING_REVIEW', label: 'Pendientes', stat: 'PENDING_REVIEW' },
  { value: 'APPROVED', label: 'Aprobados', stat: 'APPROVED' },
  { value: 'DRAFT', label: 'Borradores', stat: 'DRAFT' },
  { value: 'REJECTED', label: 'Rechazados', stat: 'REJECTED' },
  { value: 'SUSPENDED', label: 'Suspendidos', stat: 'SUSPENDED' },
  { value: 'ALL', label: 'Todos' },
];

function isFilter(v: string | null): v is Filter {
  return !!v && FILTERS.some((f) => f.value === v);
}

export function ProfilesListPage({ listPath }: { listPath: string }) {
  const navigate = useNavigate();
  usePageTitle(`DJs · Admin · ${SITE_NAME}`);
  const [params, setParams] = useSearchParams();
  const stats = useAdminStats();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const rawStatus = params.get('estado');
  const pendingCount = stats.data?.profiles?.PENDING_REVIEW ?? stats.data?.pendingReview ?? 0;
  // Sin filtro en la URL: «Pendientes» si hay alguno; se espera a los contadores para no saltar.
  const filter: Filter | null = isFilter(rawStatus)
    ? rawStatus
    : stats.isPending
      ? null
      : pendingCount > 0
        ? 'PENDING_REVIEW'
        : 'ALL';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);

  const list = useAdminProfiles(
    { status: filter && filter !== 'ALL' ? filter : undefined, q: q || undefined, page },
    filter !== null,
  );

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Búsqueda con pausa: no se pide la lista por cada letra.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) setParam({ q: search.trim() || null, pagina: null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo corre al escribir; q y setParam cambian con cada URL
  }, [search]);

  const editPath = (id: string, tab = '') => `${listPath}/${encodeURIComponent(id)}${tab ? `/${tab}` : ''}`;
  const { run, modals } = useProfileActions({ onOpenLegal: (p) => navigate(editPath(p.id, 'legal')) });

  const segmentOptions = FILTERS.map((f) => {
    const count = f.stat ? stats.data?.profiles?.[f.stat] : undefined;
    return { value: f.value, label: typeof count === 'number' ? `${f.label} (${count})` : f.label };
  });

  const columns = useMemo<TableColumnsType<AdminProfileListItemDto>>(
    () => [
      {
        key: 'photo',
        title: 'Foto',
        width: 64,
        render: (_v, p) => <ImageThumb image={p.cardImage} alt="" width={40} aspect="4 / 5" />,
      },
      {
        key: 'name',
        title: 'DJ',
        render: (_v, p) => (
          <Space orientation="vertical" size={0}>
            <Link to={editPath(p.id)}>
              <Typography.Text strong>{p.displayName}</Typography.Text>
            </Link>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              /{p.slug}
            </Typography.Text>
          </Space>
        ),
      },
      {
        key: 'status',
        title: 'Estado',
        render: (_v, p) => (
          <Space size={4} wrap>
            <Tag color={PROFILE_STATUS[p.status].color}>{PROFILE_STATUS[p.status].label}</Tag>
            {hiddenByOwner(p) ? (
              <Tooltip title="La cuenta del dueño está suspendida: la página no se ve en público.">
                <Tag color="orange">No visible</Tag>
              </Tooltip>
            ) : null}
            {p.status === 'APPROVED' && !p.hasLegalInfo ? (
              <Tooltip title="Publicado sin el registro del art. 53. Cárgalo en «Datos legales».">
                <Tag color="red">Sin datos legales</Tag>
              </Tooltip>
            ) : null}
          </Space>
        ),
      },
      {
        key: 'owner',
        title: 'Dueño',
        responsive: ['md'],
        render: (_v, p) => (p.owner ? p.owner.username : <Typography.Text type="secondary">Sin dueño</Typography.Text>),
      },
      {
        key: 'featured',
        title: 'Destacado',
        render: (_v, p) => <FeaturedSwitch profile={p} />,
      },
      {
        key: 'next',
        title: 'Próxima fecha',
        responsive: ['lg'],
        render: (_v, p) => (p.nextEventDate ? formatDate(p.nextEventDate) : '—'),
      },
      {
        key: 'bookings',
        title: 'Solicitudes nuevas',
        responsive: ['md'],
        render: (_v, p) =>
          p.newBookings ? (
            <Link
              to={`/admin/solicitudes?dj=${encodeURIComponent(p.id)}&estado=NEW`}
              aria-label={`Ver las ${p.newBookings} solicitudes nuevas de ${p.displayName}`}
            >
              <Badge count={p.newBookings} overflowCount={99} />
            </Link>
          ) : (
            '0'
          ),
      },
      {
        key: 'legal',
        title: 'Datos legales',
        responsive: ['lg'],
        render: (_v, p) => (p.hasLegalInfo ? <Tag color="green">Sí</Tag> : <Tag color="orange">Falta</Tag>),
      },
      {
        key: 'created',
        title: 'Creado',
        responsive: ['xl'],
        render: (_v, p) => formatDate(p.createdAt),
      },
      {
        key: 'actions',
        title: 'Acciones',
        fixed: 'right',
        width: 72,
        render: (_v, p) => <RowActions profile={p} editPath={editPath} onAction={run} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editPath es una función nueva en cada render que solo depende de listPath
    [listPath, run],
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          DJs
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          Nuevo perfil
        </Button>
      </Space>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <Segmented<Filter>
          options={segmentOptions}
          value={filter ?? undefined}
          onChange={(v) => setParam({ estado: v, pagina: null })}
        />
      </div>
      <Input.Search
        allowClear
        placeholder="Buscar por nombre o dirección"
        aria-label="Buscar perfiles"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onSearch={(v) => setParam({ q: v.trim() || null, pagina: null })}
        style={{ maxWidth: 420 }}
        maxLength={60}
      />
      {list.isError ? (
        <Alert
          type="error"
          showIcon
          title={errorMessage(list.error)}
          action={<Button onClick={() => void list.refetch()}>Reintentar</Button>}
        />
      ) : null}
      <Table<AdminProfileListItemDto>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={list.data?.items ?? []}
        loading={filter === null || list.isFetching}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: q ? 'No hay perfiles que coincidan con la búsqueda.' : 'No hay perfiles en este estado.' }}
        pagination={{
          current: list.data?.page ?? page,
          pageSize: list.data?.pageSize ?? PROFILES_PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: (p) => setParam({ pagina: p > 1 ? String(p) : null }),
        }}
      />
      {creating ? (
        <NewProfileModal
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            navigate(editPath(p.id));
          }}
        />
      ) : null}
      {modals}
    </Space>
  );
}

function RowActions({
  profile,
  editPath,
  onAction,
}: {
  profile: AdminProfileListItemDto;
  editPath: (id: string, tab?: string) => string;
  onAction: (a: ProfileAction, p: AdminProfileListItemDto) => void;
}) {
  const navigate = useNavigate();
  const allowed = allowedActions(profile.status);
  const items: MenuProps['items'] = [
    { key: 'edit', label: 'Editar' },
    ...(profile.status === 'APPROVED' ? [{ key: 'view', label: 'Ver página' }] : []),
    { key: 'preview', label: 'Vista previa' },
    { type: 'divider' as const },
    ...(allowed.approve ? [{ key: 'approve', label: 'Aprobar' }] : []),
    ...(allowed.reject ? [{ key: 'reject', label: 'Rechazar' }] : []),
    ...(allowed.suspend ? [{ key: 'suspend', label: 'Suspender' }] : []),
    ...(allowed.reinstate ? [{ key: 'reinstate', label: 'Reactivar' }] : []),
    { key: 'owner', label: 'Asignar dueño' },
    { type: 'divider' as const },
    { key: 'delete', label: 'Eliminar', danger: true },
  ];
  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'edit') navigate(editPath(profile.id));
    else if (key === 'view') openPublicPage(profile.slug);
    else if (key === 'preview') openInNewTab(`/_preview?profile=${encodeURIComponent(profile.id)}`);
    else onAction(key as ProfileAction, profile);
  };
  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']}>
      <Button icon={<MoreOutlined />} aria-label={`Acciones de ${profile.displayName}`} />
    </Dropdown>
  );
}

function FeaturedSwitch({ profile }: { profile: AdminProfileListItemDto }) {
  const client = useQueryClient();
  const refresh = useRefreshProfile();
  const { message } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? profile.featured;

  const toggle = async (featured: boolean) => {
    setBusy(true);
    setOptimistic(featured);
    try {
      await http.patch(`${adminProfileBase(profile.id)}/feature`, { featured, featuredRank: profile.featuredRank });
      await refresh(profile.id);
      message.success(featured ? 'Destacado en el inicio' : 'Ya no está destacado');
    } catch (e) {
      message.error(errorMessage(e));
      void client.invalidateQueries({ queryKey: ['admin', 'profiles'] });
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  };

  // Se puede destacar antes de aprobar: el inicio solo muestra perfiles aprobados.
  const sw = (
    <Switch
      size="small"
      checked={checked}
      loading={busy}
      aria-label={`Destacar a ${profile.displayName}`}
      onChange={(v) => void toggle(v)}
    />
  );
  return profile.status === 'APPROVED' ? sw : <Tooltip title="Se verá en el inicio cuando esté aprobado">{sw}</Tooltip>;
}
