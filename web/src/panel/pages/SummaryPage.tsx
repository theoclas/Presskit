import {
  CheckCircleFilled,
  ExclamationCircleOutlined,
  EyeOutlined,
  InboxOutlined,
  LinkOutlined,
  RollbackOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { SLUG_RE, type EditorProfileDto } from '@fersua/shared';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Popconfirm, Progress, Row, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { openInNewTab, openPublicPage } from '../../admin/profiles/openInNewTab';
import { useAuth } from '../../auth/AuthProvider';
import { useAfterSave, useEditorProfile } from '../../editor-kit/api';
import { useFeedback } from '../../editor-kit/feedback';
import { http } from '../../lib/http';
import { OWNER_BASE, useUnreadCount } from '../api';
import { PanelPageHeader } from '../components';
import { panelErrorMessage } from '../errors';
import { STATUS_COLORS, canSubmit, checklistItems, statusBanner, submitProblem, type SubmitProblem } from '../status';

/** /panel — estado del perfil, lo que falta para enviarlo y accesos rápidos. */
export function SummaryPage({ profile }: { profile: EditorProfileDto }) {
  const { user, refreshMe } = useAuth();
  const { message } = useFeedback();
  const navigate = useNavigate();
  const afterSave = useAfterSave();
  const { refetch } = useEditorProfile();
  const unread = useUnreadCount(true);
  const [rawProblem, setProblem] = useState<SubmitProblem | null>(null);

  const emailVerified = !!user?.emailVerified;
  // Si confirmó el correo después del error, el aviso ya no aplica.
  const problem = rawProblem?.code === 'EMAIL_NOT_VERIFIED' && emailVerified ? null : rawProblem;
  const banner = statusBanner(profile);
  const items = checklistItems(profile, emailVerified);
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const pageUrl = SLUG_RE.test(profile.slug) ? `${host}/${profile.slug}` : null;

  const afterStatusChange = async (p: EditorProfileDto | undefined) => {
    await afterSave(p ?? null);
    // MeDto.profile.status también cambia.
    void refreshMe().catch(() => undefined);
  };

  const submit = useMutation({
    mutationFn: async () => (await http.post<EditorProfileDto>(`${OWNER_BASE}/submit`)).data,
    onSuccess: async (p) => {
      setProblem(null);
      await afterStatusChange(p);
      message.success('¡Enviado! Te avisaremos por correo cuando lo revisemos.');
    },
    onError: (e) => {
      const pr = submitProblem(e);
      setProblem(pr);
      if (pr.code === 'INVALID_TRANSITION') void refetch();
      if (pr.code === 'EMAIL_NOT_VERIFIED') void refreshMe().catch(() => undefined);
    },
  });

  const withdraw = useMutation({
    mutationFn: async () => (await http.post<EditorProfileDto>(`${OWNER_BASE}/withdraw`)).data,
    onSuccess: async (p) => {
      await afterStatusChange(p);
      message.success('Retiraste tu perfil de revisión: volvió a borrador.');
    },
    onError: (e) => {
      message.error(panelErrorMessage(e));
      void refetch();
    },
  });

  return (
    <>
      <PanelPageHeader title="Resumen">
        <Space wrap size={8}>
          <Typography.Text strong>{profile.displayName}</Typography.Text>
          <Tag color={STATUS_COLORS[profile.status]}>{banner.label}</Tag>
        </Space>
      </PanelPageHeader>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type={banner.type}
          showIcon
          title={banner.title}
          description={
            <>
              {banner.reason ? (
                <div className="panel-reason">
                  <Typography.Text strong>Motivo del equipo:</Typography.Text>
                  <p className="panel-plain">{banner.reason}</p>
                </div>
              ) : null}
              <span>{banner.description}</span>
            </>
          }
        />

        <Space wrap>
          {canSubmit(profile.status) ? (
            <Button type="primary" icon={<SendOutlined />} loading={submit.isPending} onClick={() => submit.mutate()}>
              Enviar a revisión
            </Button>
          ) : null}
          {profile.status === 'PENDING_REVIEW' ? (
            <Popconfirm
              title="¿Retirar tu perfil de revisión?"
              description="Vuelve a borrador y sale de la fila de revisión. Podrás enviarlo otra vez cuando quieras."
              okText="Retirar"
              cancelText="Cancelar"
              okButtonProps={{ loading: withdraw.isPending }}
              onConfirm={() => withdraw.mutateAsync().catch(() => undefined)}
            >
              <Button icon={<RollbackOutlined />}>Retirar de revisión</Button>
            </Popconfirm>
          ) : null}
          <Button icon={<EyeOutlined />} onClick={() => openInNewTab('/_preview')}>
            Vista previa
          </Button>
          {profile.status === 'APPROVED' ? (
            <Button icon={<LinkOutlined />} onClick={() => openPublicPage(profile.slug)}>
              Ver mi página
            </Button>
          ) : null}
        </Space>

        {problem ? (
          <Alert
            type="error"
            showIcon
            closable={{ onClose: () => setProblem(null), 'aria-label': 'Cerrar aviso' }}
            title={problem.title}
            description={
              problem.items.length || problem.link ? (
                <>
                  {problem.items.length ? (
                    <ul className="panel-problem-list">
                      {problem.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  ) : null}
                  {problem.link ? <Link to={problem.link.to}>{problem.link.label}</Link> : null}
                </>
              ) : undefined
            }
          />
        ) : null}

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={15}>
            <Card
              size="small"
              title={profile.status === 'APPROVED' ? 'Tu página completa' : 'Lista para enviar a revisión'}
              extra={
                <Typography.Text type="secondary">
                  {done} de {items.length}
                </Typography.Text>
              }
            >
              <Progress percent={Math.round((done / items.length) * 100)} showInfo={false} size="small" />
              <ul className="panel-checklist" aria-label="Lista para enviar a revisión">
                {items.map((it) => (
                  <li key={it.key} data-done={it.done}>
                    {it.done ? (
                      <CheckCircleFilled className="panel-check-ok" aria-hidden="true" />
                    ) : (
                      <ExclamationCircleOutlined className="panel-check-todo" aria-hidden="true" />
                    )}
                    <div className="panel-check-text">
                      <span>
                        {it.label}
                        <span className="visually-hidden">{it.done ? ' (listo)' : ' (pendiente)'}</span>
                      </span>
                      {!it.done && it.hint ? <Typography.Text type="secondary">{it.hint}</Typography.Text> : null}
                    </div>
                    {!it.done && it.to ? (
                      <Button size="small" onClick={() => navigate(it.to!)}>
                        Completar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {complete && canSubmit(profile.status) ? (
                <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                  Todo listo: ya puedes enviar tu perfil a revisión.
                </Typography.Paragraph>
              ) : null}
            </Card>
          </Col>
          <Col xs={24} lg={9}>
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title="Solicitudes">
                <Space orientation="vertical" size={8}>
                  <Typography.Text>
                    {unread.data
                      ? unread.data.count === 1
                        ? 'Tienes 1 solicitud nueva.'
                        : unread.data.count
                          ? `Tienes ${unread.data.count} solicitudes nuevas.`
                          : 'No tienes solicitudes nuevas.'
                      : unread.isError
                        ? 'No pudimos contar tus solicitudes.'
                        : 'Contando…'}
                  </Typography.Text>
                  <Button icon={<InboxOutlined />} onClick={() => navigate('/panel/solicitudes')}>
                    Ver solicitudes
                  </Button>
                </Space>
              </Card>
              {pageUrl ? (
                <Card size="small" title="Dirección de tu página">
                  <Typography.Paragraph
                    copyable={profile.status === 'APPROVED' ? { text: `${window.location.protocol}//${pageUrl}` } : false}
                    style={{ margin: 0 }}
                  >
                    {pageUrl}
                  </Typography.Paragraph>
                  {profile.status !== 'APPROVED' ? (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      Se activa cuando el equipo apruebe tu perfil.
                    </Typography.Text>
                  ) : null}
                </Card>
              ) : null}
            </Space>
          </Col>
        </Row>
      </Space>
    </>
  );
}
