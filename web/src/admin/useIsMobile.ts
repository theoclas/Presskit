import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

function matches(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/**
 * ≤767px: el menú lateral pasa a Drawer y las tablas se compactan. Se lee de forma síncrona
 * en el primer render (Grid.useBreakpoint arranca vacío y haría parpadear el Sider en móvil).
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return mobile;
}
