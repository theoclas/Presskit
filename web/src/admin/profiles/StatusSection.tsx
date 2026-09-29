import type { EditorProfileDto } from '@fersua/shared';
import { Alert, Button, Card, Col, Descriptions, InputNumber, Row, Space, Switch, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useFeedback } from '../../editor-kit/feedback';
import { http } from '../../lib/http';
import { errorMessage } from '../errors';
import { formatDateTime } from '../format';
import { PROFILE_STATUS } from '../labels';
import { adminProfileBase, useRefreshProfile } from './api';
import { allowedActions, type ProfileAction, type ProfileRef } from './useProfileActions';
import { hiddenByOwner } from './visibility';

interface Props {
  profile: EditorProfileDto;
  onAction: (a: ProfileAction, p: ProfileRef) => void;
}

export function toProfileRef(p: EditorProfileDto): ProfileRef {
  return {
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    status: p.status,
    hasLegalInfo: p.hasLegalInfo,
    owner: p.owner ? { id: p.owner.id, username: p.owner.username } : null,
    featured: p.featured,
    featuredRank: p.featuredRank,
  };
}

/** Pestaña «Estado»: ciclo de vida, dueño, destacado y zona de peligro (solo admin). */
export function StatusSection({ profile, onAction }: Props) {
  const ref = toProfileRef(profile);
  const allowed = allowedActions(profile.status);
  const status = PROFILE_STATUS[profile.status];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={14}>
        <Card title="Estado del perfil" size="small">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'status', label: 'Estado', children: <Tag color={status.color}>{status.label}</Tag> },
              ...(profile.statusReason
                ? [{ key: 'reason', label: 'Motivo', children: <Typography.Text>{profile.statusReason}</Typography.Text> }]
                : []),
              { key: 'submitted', label: 'Enviado a revisión', children: formatDateTime(profile.submittedAt) },
              { key: 'approved', label: 'Aprobado', children: formatDateTime(profile.approvedAt) },
              { key: 'updated', label: 'Última edición', children: formatDateTime(profile.updatedAt) },
              {
                key: 'legal',
                label: 'Datos legales (art. 53)',
                children: profile.hasLegalInfo ? <Tag color="green">Cargados</Tag> : <Tag color="orange">Faltan</Tag>,
              },
            ]}
          />
          {!profile.hasLegalInfo && (allowed.approve || allowed.reinstate) ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              title={`Para ${allowed.approve ? 'aprobar' : 'reactivar'}, primero carga los datos legales del responsable.`}
            />
          ) : null}
          {profile.status === 'APPROVED' && !profile.hasLegalInfo ? (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              title="Está publicado sin los datos legales del responsable (art. 53 Ley 1480). Cárgalos en «Datos legales»."
            />
          ) : null}
          {hiddenByOwner(profile) ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              title="No visible en público: la cuenta del dueño está suspendida. Reactívala en Usuarios para que la página vuelva a verse."
            />
          ) : null}
          <Space wrap style={{ marginTop: 16 }}>
            {allowed.approve ? (
              <Button type="primary" onClick={() => onAction('approve', ref)}>
                Aprobar
              </Button>
            ) : null}
            {allowed.reject ? (
              <Button danger onClick={() => onAction('reject', ref)}>
                Rechazar
              </Button>
            ) : null}
            {allowed.suspend ? (
              <Button danger onClick={() => onAction('suspend', ref)}>
                Suspender
              </Button>
            ) : null}
            {allowed.reinstate ? (
              <Button type="primary" onClick={() => onAction('reinstate', ref)}>
                Reactivar
              </Button>
            ) : null}
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={10}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Card title="Dueño" size="small">
            <Typography.Paragraph>
              {profile.owner ? (
                <>
                  <strong>{profile.owner.username}</strong>
                  {profile.owner.status === 'SUSPENDED' ? (
                    <Tag color="red" style={{ marginInlineStart: 8 }}>
                      Cuenta suspendida
                    </Tag>
                  ) : null}
                </>
              ) : (
                <Typography.Text type="secondary">Sin dueño: solo lo edita el administrador.</Typography.Text>
              )}
            </Typography.Paragraph>
            <Button onClick={() => onAction('owner', ref)}>{profile.owner ? 'Cambiar dueño' : 'Asignar dueño'}</Button>
          </Card>
          <FeaturedCard profile={profile} />
          <Card title="Zona de peligro" size="small">
            <Typography.Paragraph type="secondary">
              Borrar el perfil elimina todo su contenido, también sus solicitudes, y libera la dirección. Los datos
              legales se conservan 12 meses. Pide tu contraseña y tu código.
            </Typography.Paragraph>
            <Button danger onClick={() => onAction('delete', ref)}>
              Eliminar perfil
            </Button>
          </Card>
        </Space>
      </Col>
    </Row>
  );
}

function FeaturedCard({ profile }: { profile: EditorProfileDto }) {
  const refresh = useRefreshProfile();
  const { message } = useFeedback();
  const [featured, setFeatured] = useState(profile.featured);
  const [rank, setRank] = useState<number>(profile.featuredRank);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState({ f: profile.featured, r: profile.featuredRank });
  if (last.f !== profile.featured || last.r !== profile.featuredRank) {
    setLast({ f: profile.featured, r: profile.featuredRank });
    setFeatured(profile.featured);
    setRank(profile.featuredRank);
  }
  const dirty = featured !== profile.featured || rank !== profile.featuredRank;

  const save = async () => {
    setSaving(true);
    try {
      await http.patch(`${adminProfileBase(profile.id)}/feature`, { featured, featuredRank: rank });
      await refresh(profile.id);
      message.success('Cambios guardados');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Destacado en el inicio" size="small">
      <Space orientation="vertical" size={12}>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <Switch size="small" checked={featured} onChange={setFeatured} />
          <span>Mostrar entre los destacados (solo si está aprobado)</span>
        </label>
        <Space>
          <Typography.Text id="featured-rank-label">Orden</Typography.Text>
          <InputNumber
            aria-labelledby="featured-rank-label"
            min={0}
            max={999}
            precision={0}
            value={rank}
            disabled={!featured}
            onChange={(v) => setRank(typeof v === 'number' ? v : 0)}
          />
          <Typography.Text type="secondary">Menor = primero</Typography.Text>
        </Space>
        <Button type="primary" disabled={!dirty} loading={saving} onClick={() => void save()}>
          Guardar
        </Button>
      </Space>
    </Card>
  );
}
