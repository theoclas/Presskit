import {
  CalendarOutlined,
  DashboardOutlined,
  EditOutlined,
  FormOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuOutlined,
  PictureOutlined,
  PlusCircleOutlined,
  SafetyCertificateOutlined,
  ShareAltOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Drawer, Layout, Menu, Typography, type MenuProps } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useIsMobile } from '../admin/useIsMobile';
import { useAuth } from '../auth/AuthProvider';
import { EmailBanner } from './EmailBanner';

interface NavItem {
  /** Primer segmento después de /panel ('' = resumen). */
  key: string;
  label: string;
  icon: ReactNode;
  badge?: boolean;
}

const HOME: NavItem = { key: '', label: 'Resumen', icon: <DashboardOutlined /> };

/** Secciones del editor de la página, en el orden del menú. */
export const PAGE_NAV: NavItem[] = [
  { key: 'perfil', label: 'Perfil y textos', icon: <EditOutlined /> },
  { key: 'fotos', label: 'Fotos', icon: <PictureOutlined /> },
  { key: 'integrantes', label: 'Integrantes', icon: <TeamOutlined /> },
  { key: 'fechas', label: 'Fechas', icon: <CalendarOutlined /> },
  { key: 'rider', label: 'Rider', icon: <UnorderedListOutlined /> },
  { key: 'redes', label: 'Redes', icon: <ShareAltOutlined /> },
  { key: 'formulario', label: 'Formulario', icon: <FormOutlined /> },
  { key: 'legal', label: 'Datos legales', icon: <SafetyCertificateOutlined /> },
];

const INBOX: NavItem = { key: 'solicitudes', label: 'Solicitudes', icon: <InboxOutlined />, badge: true };
const ACCOUNT: NavItem = { key: 'cuenta', label: 'Cuenta', icon: <UserOutlined /> };
const CREATE: NavItem = { key: '', label: 'Crear mi perfil', icon: <PlusCircleOutlined /> };

function pathFor(key: string): string {
  return key ? `/panel/${key}` : '/panel';
}

function currentKey(pathname: string): string {
  return pathname.replace(/^\/panel\/?/, '').split('/')[0] ?? '';
}

interface Props {
  hasProfile: boolean;
  unread?: number;
}

/** Marco del panel: Sider en escritorio, Drawer en móvil; cabecera con usuario y salida. */
export function PanelLayout({ hasProfile, unread = 0 }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current = currentKey(pathname);
  const selected = hasProfile ? current : current === 'cuenta' ? 'cuenta' : '';

  const items = useMemo<MenuProps['items']>(() => {
    const entry = (n: NavItem) => ({
      key: n.key || 'home',
      icon: n.icon,
      label: (
        <span className="panel-nav-label">
          {n.label}
          {n.badge && unread ? (
            <Badge count={unread} size="small" overflowCount={99} title={`${unread} sin leer`} />
          ) : null}
        </span>
      ),
    });
    if (!hasProfile) return [entry(CREATE), entry(ACCOUNT)];
    return [
      entry(HOME),
      { type: 'group' as const, key: 'g-page', label: 'Tu página', children: PAGE_NAV.map(entry) },
      { type: 'divider' as const, key: 'd-1' },
      entry(INBOX),
      entry(ACCOUNT),
    ];
  }, [hasProfile, unread]);

  const onMenu: MenuProps['onClick'] = ({ key }) => {
    navigate(pathFor(key === 'home' ? '' : key));
    setDrawerOpen(false);
  };

  const menu = (
    <Menu mode="inline" selectedKeys={[selected || 'home']} items={items} onClick={onMenu} className="panel-menu" />
  );

  const brand = (
    <div className="panel-brand">
      <span className="panel-brand-name">Fersua Studio</span>
      <span className="panel-brand-tag">Mi panel</span>
    </div>
  );

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="panel-root">
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
        <Layout.Sider width={232} className="panel-sider">
          {brand}
          {menu}
        </Layout.Sider>
      )}
      <Layout>
        <Layout.Header className="panel-header">
          {isMobile ? (
            <Button
              type="text"
              icon={
                <Badge dot={!!unread} offset={[-2, 2]}>
                  <MenuOutlined />
                </Badge>
              }
              aria-label={unread ? `Abrir menú (${unread} solicitudes sin leer)` : 'Abrir menú'}
              onClick={() => setDrawerOpen(true)}
              className="panel-menu-btn"
            />
          ) : null}
          <div className="panel-header-spacer" />
          <Typography.Text className="panel-user" ellipsis>
            <UserOutlined aria-hidden="true" /> {user?.username}
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={() => void onLogout()}>
            {isMobile ? 'Salir' : 'Cerrar sesión'}
          </Button>
        </Layout.Header>
        <Layout.Content id="main" tabIndex={-1} className="panel-content">
          <EmailBanner />
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
