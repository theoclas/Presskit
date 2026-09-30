import { EyeOutlined } from '@ant-design/icons';
import type { EditorProfileDto } from '@fersua/shared';
import { Alert, Button, Space } from 'antd';
import type { ReactNode } from 'react';
import { openInNewTab } from '../../admin/profiles/openInNewTab';
import { useAuth } from '../../auth/AuthProvider';
import { ProfileGate } from '../../editor-kit/ProfileGate';
import { BookingFormSection } from '../../editor-kit/sections/BookingFormSection';
import { EventsSection } from '../../editor-kit/sections/EventsSection';
import { LegalInfoSection } from '../../editor-kit/sections/LegalInfoSection';
import { MembersSection } from '../../editor-kit/sections/MembersSection';
import { PhotosSection } from '../../editor-kit/sections/PhotosSection';
import { ProfileSection } from '../../editor-kit/sections/ProfileSection';
import { RiderSection } from '../../editor-kit/sections/RiderSection';
import { SocialsSection } from '../../editor-kit/sections/SocialsSection';
import { PanelPageHeader } from '../components';

// Secciones del editor (las mismas del admin, con base '/me/profile'). Van en un chunk aparte
// porque traen dnd-kit y el recorte de fotos: el resumen y la bandeja cargan sin esperarlas.

export type EditorSectionKey = 'perfil' | 'fotos' | 'integrantes' | 'fechas' | 'rider' | 'redes' | 'formulario' | 'legal';

interface SectionDef {
  title: string;
  /** La sección sube fotos: sin correo confirmado el api las rechaza (403 EMAIL_NOT_VERIFIED). */
  uploads?: boolean;
  render: (profile: EditorProfileDto) => ReactNode;
}

export const EDITOR_SECTIONS: Record<EditorSectionKey, SectionDef> = {
  perfil: { title: 'Perfil y textos', render: (p) => <ProfileSection profile={p} /> },
  fotos: { title: 'Fotos', uploads: true, render: (p) => <PhotosSection profile={p} /> },
  integrantes: { title: 'Integrantes', uploads: true, render: (p) => <MembersSection profile={p} /> },
  fechas: { title: 'Fechas', uploads: true, render: (p) => <EventsSection profile={p} /> },
  rider: { title: 'Rider', render: (p) => <RiderSection profile={p} /> },
  redes: { title: 'Redes', render: (p) => <SocialsSection profile={p} /> },
  formulario: { title: 'Formulario', render: (p) => <BookingFormSection profile={p} /> },
  // El aviso de privacidad para el dueño ("Solo lo ve el administrador…") lo pone la sección.
  legal: { title: 'Datos legales', render: () => <LegalInfoSection /> },
};

export function EditorSectionPage({ section, profile }: { section: EditorSectionKey; profile: EditorProfileDto }) {
  const { user } = useAuth();
  const def = EDITOR_SECTIONS[section];
  const blockedUploads = def.uploads && !user?.emailVerified;

  return (
    <>
      <PanelPageHeader
        title={def.title}
        extra={
          <Button icon={<EyeOutlined />} onClick={() => openInNewTab('/_preview')}>
            Vista previa
          </Button>
        }
      />
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {profile.status === 'APPROVED' && section !== 'legal' ? (
          <Alert type="info" showIcon title="Tu perfil está aprobado: lo que guardes se publica al instante." />
        ) : null}
        {blockedUploads ? (
          <Alert
            type="warning"
            showIcon
            title="Para subir fotos primero confirma tu correo."
            description="Abre el enlace que te enviamos (o pide uno nuevo en el aviso de arriba). Mientras tanto puedes editar los textos."
          />
        ) : null}
        {section === 'legal' ? def.render(profile) : <ProfileGate>{(p) => def.render(p)}</ProfileGate>}
      </Space>
    </>
  );
}

export default EditorSectionPage;
