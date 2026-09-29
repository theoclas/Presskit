import { useLayoutEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { SCROLL_STORAGE_KEY } from '../../lib/scroll';

/** Todas las rutas públicas: fondo de la plantilla en <body> y enlace para saltar al contenido. */
export function PublicLayout() {
  useLayoutEffect(() => {
    document.documentElement.dataset.surface = 'public';
  }, []);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // Sin cambiar la URL: solo mueve el foco al contenido.
          const main = document.getElementById('main');
          if (!main) return;
          e.preventDefault();
          main.focus();
        }}
      >
        Saltar al contenido
      </a>
      <Outlet />
      <ScrollRestoration storageKey={SCROLL_STORAGE_KEY} />
    </>
  );
}

/** Mientras carga un chunk diferido en la primera visita: solo el fondo (sin saltos de layout). */
export function PublicFallback() {
  return null;
}
