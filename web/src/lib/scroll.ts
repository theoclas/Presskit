/** Clave propia para las posiciones de scroll que guarda <ScrollRestoration>. */
export const SCROLL_STORAGE_KEY = 'fersua-scroll';

/**
 * React Router guarda la primera entrada del historial con la clave "default": una visita
 * nueva (enlace externo o barra de direcciones) heredaría el scroll de otra página vista
 * antes en la misma pestaña. Se borra solo en visitas nuevas; recargar o volver atrás lo conserva.
 */
export function forgetInitialScroll(): void {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type !== 'navigate') return;
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!raw) return;
    const positions = JSON.parse(raw) as Record<string, number>;
    if (positions && typeof positions === 'object' && 'default' in positions) {
      delete positions.default;
      sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
    }
  } catch {
    // sessionStorage bloqueado (modo privado, webviews): no pasa nada.
  }
}
