import { useCallback, useEffect, useRef, type RefObject } from 'react';

// Token HMAC de un solo uso de los formularios públicos (booking y PQRS). El servidor exige un
// tiempo mínimo desde que lo emite (FORM_TOO_FAST) y lo da por vencido a las 2 h (FORM_EXPIRED).

interface Options {
  /** Formulario que, al entrar en pantalla, pide el token. */
  formRef: RefObject<HTMLElement | null>;
  /** Pide un token nuevo al api. */
  fetchToken: () => Promise<string>;
  /** Se renueva antes de que venza en el servidor para no fallar justo al enviar. */
  refreshMs: number;
  /** false en la vista previa del editor: ahí el formulario no se envía. */
  enabled?: boolean;
}

export interface FormToken {
  /** El token vigente, o uno nuevo si no hay (force: siempre uno nuevo). */
  ensureToken: (force?: boolean) => Promise<string>;
  /** Olvida el token (ya se usó) sin pedir otro. */
  discard: () => void;
  /** Olvida el token y pide otro en segundo plano (el servidor lo rechazó o lo gastó). */
  renew: () => void;
}

export function useFormToken({ formRef, fetchToken, refreshMs, enabled = true }: Options): FormToken {
  const tokenRef = useRef<{ value: string; at: number } | null>(null);
  const pending = useRef<Promise<string> | null>(null);

  const ensureToken = useCallback(
    (force = false): Promise<string> => {
      const t = tokenRef.current;
      if (!force && t && Date.now() - t.at < refreshMs) return Promise.resolve(t.value);
      if (!force && pending.current) return pending.current;
      const p = fetchToken()
        .then((token) => {
          tokenRef.current = { value: token, at: Date.now() };
          return token;
        })
        .finally(() => {
          if (pending.current === p) pending.current = null;
        });
      pending.current = p;
      return p;
    },
    [fetchToken, refreshMs],
  );

  const discard = useCallback(() => {
    tokenRef.current = null;
  }, []);

  const renew = useCallback(() => {
    tokenRef.current = null;
    ensureToken(true).catch(() => undefined);
  }, [ensureToken]);

  // El token se pide cuando el formulario entra en pantalla: quien solo mira la página no cuesta nada.
  useEffect(() => {
    const el = formRef.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          ensureToken().catch(() => undefined);
          io.disconnect();
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ensureToken, enabled, formRef]);

  return { ensureToken, discard, renew };
}
