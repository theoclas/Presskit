import { theme, type ThemeConfig } from 'antd';
import esES from 'antd/locale/es_ES';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

// Tema del admin (y del panel en M3): oscuro, con el naranja de la plantilla como acento.
// Solo lo importan chunks diferidos; el bundle público nunca carga antd ni dayjs.

dayjs.locale('es');

export const ADMIN_BG = '#020617';
export const ADMIN_SURFACE = '#0b1120';

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#f97316',
    colorInfo: '#f97316',
    colorLink: '#fb923c',
    colorBgBase: ADMIN_SURFACE,
    colorBgLayout: ADMIN_BG,
    borderRadius: 10,
    fontFamily: '"Inter Variable", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Layout: {
      bodyBg: ADMIN_BG,
      headerBg: ADMIN_SURFACE,
      siderBg: ADMIN_SURFACE,
      headerPadding: '0 16px',
    },
    Menu: {
      itemBg: 'transparent',
    },
  },
};

export const antdLocale = esES;
