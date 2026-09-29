import type { EditorProfileDto } from '@fersua/shared';
import { ArrowLeftOutlined, EyeOutlined, InboxOutlined, LinkOutlined } from '@ant-design/icons';
import { Alert, Button, Select, Space, Tabs, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { useEditorProfile } from '../../editor-kit/api';
import { ProfileGate } from '../../editor-kit/ProfileGate';
import { EditorScopeProvider } from '../../editor-kit/scope';
import { BookingFormSection } from '../../editor-kit/sections/BookingFormSection';
import { EventsSection } from '../../editor-kit/sections/EventsSection';
import { LegalInfoSection } from '../../editor-kit/sections/LegalInfoSection';
import { MembersSection } from '../../editor-kit/sections/MembersSection';
import { PhotosSection } from '../../editor-kit/sections/PhotosSection';
import { ProfileSection } from '../../editor-kit/sections/ProfileSection';
import { RiderSection } from '../../editor-kit/sections/RiderSection';
import { SocialsSection } from '../../editor-kit/sections/SocialsSection';
import { UnsavedChangesProvider } from '../../editor-kit/unsaved';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { PROFILE_STATUS } from '../labels';
import { useIsMobile } from '../useIsMobile';
import { adminProfileBase } from './api';
import { openInNewTab, openPublicPage } from './openInNewTab';
import { StatusSection } from './StatusSection';
import { useProfileActions } from './useProfileActions';
import { useSplatBase } from './useSplatBase';
import { hiddenByOwner, isPubliclyVisible } from './visibility';

/** Pestañas del editor = subrutas (/admin/djs/:id/<tab>): recargar o volver deja la misma pestaña. */
export const EDITOR_TABS = [
  { key: 'perfil', label: 'Perfil y textos' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'integrantes', label: 'Integrantes' },
  { key: 'fechas', label: 'Fechas' },
  { key: 'rider', label: 'Rider' },
  { key: 'redes', label: 'Redes' },
  { key: 'formulario', label: 'Formulario' },
  { key: 'legal', label: 'Datos legales' },
  { key: 'estado', label: 'Estado' },
] as const;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Editor de un perfil como admin. Va en la ruta `:id/*` de ProfilesSection. */
export function ProfileEditorPage({ listPath }: { listPath: string }) {
  const { id = '' } = useParams();
  if (!ID_RE.test(id)) return <Navigate to={listPath} replace />;
  return (
    // key: al pasar a otro perfil se desmonta todo (formularios, cambios sin guardar, subidas).
    <EditorScopeProvider key={id} base={adminProfileBase(id)} actor="admin" genresUrl="/admin/genres">
      <UnsavedChangesProvider>
        <EditorShell id={id} listPath={listPath} />
      </UnsavedChangesProvider>
    </EditorScopeProvider>
  );
}

function EditorShell({ id, listPath }: { id: string; listPath: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Rutas absolutas: dentro de una ruta con * los enlaces relativos parten de la pestaña actual.
  const editorPath = useSplatBase();
  const profile = useEditorProfile();
  const p = profile.data;
  const isMobile = useIsMobile();
  usePageTitle(p ? `${p.displayName} · Admin · ${SITE_NAME}` : null);

  const active = pathname.slice(editorPath.length + 1).split('/')[0] || 'perfil';
  const { run, modals } = useProfileActions({
    onOpenLegal: () => navigate(`${editorPath}/legal`),
    onDeleted: () => navigate(listPath, { replace: true }),
  });

  const section = (render: (profile: EditorProfileDto) => ReactNode) => <ProfileGate>{render}</ProfileGate>;
  const toFirstTab = <Navigate to={`${editorPath}/perfil`} replace />;

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Link to={listPath}>
        <ArrowLeftOutlined aria-hidden="true" /> Todos los DJs
      </Link>
      {p ? (
        <>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }} align="center">
            <Space wrap align="center">
              <Typography.Title level={3} style={{ margin: 0 }}>
                {p.displayName}
              </Typography.Title>
              <Tag color={PROFILE_STATUS[p.status].color}>{PROFILE_STATUS[p.status].label}</Tag>
              <Typography.Text type="secondary">/{p.slug}</Typography.Text>
            </Space>
            <Space wrap>
              <Button icon={<EyeOutlined />} onClick={() => openInNewTab(`/_preview?profile=${encodeURIComponent(id)}`)}>
                Vista previa
              </Button>
              {isPubliclyVisible(p) ? (
                <Button icon={<LinkOutlined />} onClick={() => openPublicPage(p.slug)}>
                  Ver página
                </Button>
              ) : null}
              <Button icon={<InboxOutlined />} onClick={() => navigate(`/admin/solicitudes?dj=${encodeURIComponent(id)}`)}>
                Solicitudes
              </Button>
            </Space>
          </Space>
          <Alert
            type="warning"
            showIcon
            title={
              isMobile
                ? 'Editas como administrador: queda en la auditoría.'
                : `Estás editando «${p.displayName}» como administrador. Los cambios quedan en la auditoría.`
            }
            description={
              hiddenByOwner(p)
                ? 'Aprobado, pero no visible en público: la cuenta del dueño está suspendida. Reactívala en Usuarios.'
                : p.status === 'APPROVED'
                  ? 'El perfil está aprobado: lo que guardes se publica al instante.'
                  : isMobile
                    ? undefined
                    : 'Guarda y usa «Vista previa» para ver cómo queda antes de aprobarlo.'
            }
          />
          {p.status === 'APPROVED' && !p.hasLegalInfo ? (
            <Alert
              type="error"
              showIcon
              title="Está publicado sin los datos legales del responsable (art. 53 Ley 1480)."
              action={
                <Button size="small" onClick={() => navigate(`${editorPath}/legal`)}>
                  Cargarlos
                </Button>
              }
            />
          ) : null}
        </>
      ) : null}
      {isMobile ? (
        // 9 pestañas no caben en 390 px: en el teléfono la sección se elige de una lista.
        <Select
          aria-label="Sección del perfil"
          value={active}
          onChange={(key: string) => navigate(`${editorPath}/${key}`)}
          options={EDITOR_TABS.map((t) => ({ value: t.key, label: t.label }))}
          style={{ width: '100%' }}
        />
      ) : (
        <Tabs
          activeKey={active}
          onChange={(key) => navigate(`${editorPath}/${key}`)}
          items={EDITOR_TABS.map((t) => ({ key: t.key, label: t.label }))}
        />
      )}
      <Routes>
        <Route index element={toFirstTab} />
        <Route path="perfil" element={section((pr) => <ProfileSection profile={pr} />)} />
        <Route path="fotos" element={section((pr) => <PhotosSection profile={pr} />)} />
        <Route path="integrantes" element={section((pr) => <MembersSection profile={pr} />)} />
        <Route path="fechas" element={section((pr) => <EventsSection profile={pr} />)} />
        <Route path="rider" element={section((pr) => <RiderSection profile={pr} />)} />
        <Route path="redes" element={section((pr) => <SocialsSection profile={pr} />)} />
        <Route path="formulario" element={section((pr) => <BookingFormSection profile={pr} />)} />
        <Route path="legal" element={<LegalInfoSection />} />
        <Route path="estado" element={section((pr) => <StatusSection profile={pr} onAction={run} />)} />
        <Route path="*" element={toFirstTab} />
      </Routes>
      {modals}
    </Space>
  );
}
