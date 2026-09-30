import { PROFILE_STATUSES } from '@fersua/shared';
import { Alert, Card, Col, Row, Skeleton, Statistic, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAdminStats } from '../api';
import { LoadError, PageHeader } from '../components';
import { PROFILE_STATUS } from '../labels';

function StatCard({ title, value, to, linkText, highlight, footer }: {
  title: string;
  value: number;
  to?: string;
  linkText?: string;
  highlight?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Statistic title={title} value={value} styles={highlight && value > 0 ? { content: { color: '#fb923c' } } : undefined} />
      {footer ? <div>{footer}</div> : null}
      {to ? (
        <Link to={to} style={{ display: 'block', marginTop: 8, padding: '6px 0' }}>
          {linkText ?? 'Ver'}
        </Link>
      ) : null}
    </Card>
  );
}

/** /admin — contadores y accesos directos. */
export function OverviewPage() {
  const { data, error, isPending, refetch } = useAdminStats();

  return (
    <>
      <PageHeader title="Resumen" />
      {error && !data ? <LoadError error={error} onRetry={() => void refetch()} /> : null}
      {isPending ? (
        <Skeleton active />
      ) : data ? (
        <>
          {data.approvedWithoutLegal.length ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              title={
                data.approvedWithoutLegal.length === 1
                  ? 'Hay un perfil publicado sin los datos legales del responsable (art. 53 Ley 1480).'
                  : `Hay ${data.approvedWithoutLegal.length} perfiles publicados sin los datos legales del responsable (art. 53 Ley 1480).`
              }
              description={
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                  {data.approvedWithoutLegal.map((p) => (
                    <li key={p.id}>
                      <Link to={`/admin/djs/${encodeURIComponent(p.id)}/legal`}>{p.displayName}</Link>
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={8} xl={6}>
              <StatCard
                title="Perfiles por revisar"
                value={data.pendingReview}
                highlight
                to="/admin/djs?estado=PENDING_REVIEW"
                linkText="Revisar perfiles"
              />
            </Col>
            <Col xs={12} md={8} xl={6}>
              <StatCard
                title="Solicitudes nuevas"
                value={data.newBookings}
                highlight
                to="/admin/solicitudes?estado=NEW"
                linkText="Ver solicitudes"
              />
            </Col>
            <Col xs={12} md={8} xl={6}>
              <StatCard title="Solicitudes (30 días)" value={data.bookingsLast30Days} to="/admin/solicitudes" linkText="Ver todas" />
            </Col>
            <Col xs={12} md={8} xl={6}>
              <StatCard
                title="PQRS y reportes abiertos"
                value={data.openTickets}
                highlight
                to="/admin/pqrs"
                linkText="Atender"
                footer={
                  data.overdueTickets > 0 || data.spamTickets > 0 ? (
                    <>
                      {data.overdueTickets > 0 ? (
                        <Tag color="red" style={{ marginTop: 6 }}>
                          {data.overdueTickets} vencido{data.overdueTickets === 1 ? '' : 's'}
                        </Tag>
                      ) : null}
                      {/* El spam no cuenta como abierto: se revisa aparte si el admin quiere. */}
                      {data.spamTickets > 0 ? (
                        <Link to="/admin/pqrs?spam=1" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                          {data.spamTickets} en spam (30 días)
                        </Link>
                      ) : null}
                    </>
                  ) : null
                }
              />
            </Col>
            <Col xs={12} md={8} xl={6}>
              <StatCard title="Usuarios" value={data.users} to="/admin/usuarios" linkText="Administrar" />
            </Col>
          </Row>

          <Typography.Title level={5} style={{ marginTop: 28 }}>
            Perfiles por estado
          </Typography.Title>
          <Row gutter={[16, 16]}>
            {PROFILE_STATUSES.map((s) => (
              <Col key={s} xs={12} md={8} xl={4}>
                <StatCard
                  title={PROFILE_STATUS[s].label}
                  value={data.profiles[s] ?? 0}
                  to={`/admin/djs?estado=${s}`}
                  linkText="Ver"
                />
              </Col>
            ))}
          </Row>
        </>
      ) : null}
    </>
  );
}
