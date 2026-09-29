import { WA_URL_RE } from '@fersua/shared';

// La web nunca arma textos de WhatsApp: solo abre URLs que llegaron del api y que
// pasan WA_URL_RE (https://wa.me/<número>?text=...). Cualquier otra cosa se ignora.

export function isWhatsappUrl(url: unknown): url is string {
  return typeof url === 'string' && WA_URL_RE.test(url);
}

/** Navegadores internos de Instagram/Facebook: bloquean window.open y abren mejor en la misma pestaña. */
export function isInAppBrowser(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Instagram|FBAN|FBAV/i.test(ua);
}

/**
 * Abre WhatsApp. Devuelve false si la URL no es de wa.me (no se abre nada).
 * Tras un await, Safari de iOS bloquea los popups: si window.open falla, se navega aquí mismo.
 */
export function openWhatsApp(url: string): boolean {
  if (!isWhatsappUrl(url)) return false;
  if (isInAppBrowser()) {
    window.location.assign(url);
    return true;
  }
  // Sin 'noopener' en las features: con él window.open siempre devuelve null.
  const w = window.open(url, '_blank');
  if (w) {
    try {
      w.opener = null;
    } catch {
      // Algunos navegadores no dejan tocar opener: no importa, la URL ya es de wa.me.
    }
    return true;
  }
  window.location.assign(url);
  return true;
}
