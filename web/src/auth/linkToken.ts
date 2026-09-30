import { useLayoutEffect, useState } from 'react';

// Enlaces de los correos (/verificar-correo#t=… y /restablecer#t=…). El token va en el
// fragmento: el navegador nunca lo manda al servidor (ni a los logs de nginx) ni en el Referer.
// La página lo lee una vez, lo quita de la barra de direcciones y lo guarda solo en memoria.

/** 32 bytes en base64url (43 caracteres); cualquier otra cosa se descarta sin llamar al api. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;

/** Política que manda el edge (deploy/edge/snippets/security-headers.conf). */
const DEFAULT_REFERRER_POLICY = 'strict-origin-when-cross-origin';

/** Lee `t` del fragmento ('#t=abc' -> 'abc'), o null si falta o no tiene forma de token. */
export function readHashToken(hash: string = window.location.hash): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const token = new URLSearchParams(raw).get('t');
  return token && TOKEN_RE.test(token) ? token : null;
}

/**
 * Quita el fragmento de la URL sin recargar ni agregar una entrada al historial. Conserva el
 * estado de React Router (history.state) para que atrás/adelante sigan funcionando.
 */
export function dropUrlHash(): void {
  if (!window.location.hash) return;
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    // Sin History API (muy raro): el token sigue sirviendo una sola vez.
  }
}

/**
 * Token del enlace del correo: se lee al montar (el inicializador es puro, así el doble render
 * de StrictMode lo ve igual) y se borra de la URL antes del primer pintado.
 */
export function useLinkToken(): string | null {
  const [token] = useState(() => readHashToken());
  useLayoutEffect(() => {
    dropUrlHash();
  }, []);
  return token;
}

/**
 * `<meta name="referrer" content="no-referrer">` mientras la página del token está montada.
 * Quitar el meta no devuelve la política anterior (el navegador solo reacciona al insertarlo o
 * al cambiar su `content`), así que al salir se deja la del servidor y luego se retira.
 */
export function useNoReferrer(): void {
  useLayoutEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      meta.content = DEFAULT_REFERRER_POLICY;
      meta.remove();
    };
  }, []);
}
