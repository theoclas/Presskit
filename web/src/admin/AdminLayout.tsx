import {
  AlertOutlined,
  AuditOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Drawer, Layout, Menu, Typography, type MenuProps } from 'antd';
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { useAdminStats } from './api';
import { useIsMobile } from './useIsMobile';
import './admin.css';

interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: ReactNode;
  badge?: 'bookings' | 'tickets';
}

export const ADMIN_NAV: NavItem[] = [
  { key: 'resumen', path: '/admin', label: 'Resumen', icon: <DashboardOutlined /> },
  { key: 'djs', path: '/admin/djs', label: 'DJs', icon: <CustomerServiceOutlined /> },
  { key: 'solicitudes', path: '/admin/solicitudes', label: 'Solicitudes', icon: <InboxOutlined />, badge: 'bookings' },
  { key: 'pqrs', path: '/admin/pqrs', label: 'PQRS y reportes', icon: <AlertOutlined />, badge: 'tickets' },
  { key: 'usuarios', path: '/admin/usuarios', label: 'Usuarios', icon: <TeamOutlined /> },
  { key: 'generos', path: '/admin/generos', label: 'Géneros', icon: <TagsOutlined /> },
  { key: 'auditoria', path: '/admin/auditoria', label: 'Auditoría', icon: <AuditOutlined /> },
  { key: 'cuenta', path: '/admin/cuenta', label: 'Mi cuenta', icon: <UserOutlined /> },
];

function selectedKey(pathname: string): string {
  const seg = pathname.replace(/^\/admin\/?/, '').split('/')[0] ?? '';
  return ADMIN_NAV.find((n) => n.key === seg)?.key ?? 'resumen';
}

/** Marco del admin: Sider en escritorio, Drawer en móvil; cabecera con usuario y salida. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const stats = useAdminStats();

  // Otra superficie: el fondo con degradado de las páginas públicas no aplica aquí.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = 'admin';
    return () => {
      root.dataset.surface = 'public';
    };
  }, []);

  const current = selectedKey(pathname);

  const items = useMemo<MenuProps['items']>(
    () =>
      ADMIN_NAV.map((n) => {
        // PQRS: todas las abiertas (tienen plazo legal desde que llegan), en rojo si alguna venció.
        const count =
          n.badge === 'bookings' ? stats.data?.newBookings : n.badge === 'tickets' ? stats.data?.openTickets : undefined;
        const overdue = n.badge === 'tickets' && (stats.data?.overdueTickets ?? 0) > 0;
        return {
          key: n.key,
          icon: n.icon,
          label: (
            <span className="admin-nav-label">
              {n.label}
              {count ? (
                <Badge
                  count={count}
                  size="small"
                  overflowCount={99}
                  color={n.badge === 'tickets' && !overdue ? '#d97706' : undefined}
                  title={overdue ? `${count} abiertas, ${stats.data?.overdueTickets} vencidas` : undefined}
                />
              ) : null}
            </span>
          ),
        };
      }),
    [stats.data],
  );

  const onMenu: MenuProps['onClick'] = ({ key }) => {
    const item = ADMIN_NAV.find((n) => n.key === key);
    if (item) navigate(item.path);
    setDrawerOpen(false);
  };

  const menu = <Menu mode="inline" selectedKeys={[current]} items={items} onClick={onMenu} className="admin-menu" />;

  const brand = (
    <div className="admin-brand">
      <span className="admin-brand-name">Fersua Studio</span>
      <span className="admin-brand-tag">Admin</span>
    </div>
  );

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="admin-root">
      {isMobile ? (
        <Drawer
          open={drawerOpen}
          placement="left"
          size={272}
          onClose={() => setDrawerOpen(false)}
          title={brand}
          styles={{ body: { padding: 0 } }}
        >
          {menu}
        </Drawer>
      ) : (
        <Layout.Sider width={232} className="admin-sider">
          {brand}
          {menu}
        </Layout.Sider>
      )}
      <Layout>
        <Layout.Header className="admin-header">
          {isMobile ? (
            <Button
              type="text"
              icon={<MenuOutlined />}
              aria-label="Abrir menú"
              onClick={() => setDrawerOpen(true)}
              className="admin-menu-btn"
            />
          ) : null}
          <div className="admin-header-spacer" />
          <Typography.Text className="admin-user" ellipsis>
            <UserOutlined aria-hidden="true" /> {user?.username}
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            Cerrar sesión
          </Button>
        </Layout.Header>
        <Layout.Content id="main" tabIndex={-1} className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
