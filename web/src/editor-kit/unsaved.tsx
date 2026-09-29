import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { useFeedback } from './feedback';

// Un solo useBlocker por editor (react-router admite uno a la vez). Cada formulario reporta
// si tiene cambios sin guardar y el proveedor bloquea la navegación si alguno los tiene.

interface UnsavedCtx {
  setDirty: (key: string, dirty: boolean) => void;
}

const Ctx = createContext<UnsavedCtx | null>(null);

function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome todavía necesita returnValue para mostrar el aviso.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const { modal } = useFeedback();
  const dirty = dirtyKeys.size > 0;

  const setDirty = useCallback((key: string, value: boolean) => {
    setDirtyKeys((prev) => {
      if (prev.has(key) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Cambiar solo el ?query o el #hash no saca de la pantalla: no se bloquea.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  const asking = useRef(false);

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    modal.confirm({
      title: 'Tienes cambios sin guardar',
      content: 'Si sales ahora, se pierden. ¿Quieres salir sin guardar?',
      okText: 'Salir sin guardar',
      okButtonProps: { danger: true },
      cancelText: 'Seguir editando',
      onOk: () => {
        asking.current = false;
        blocker.proceed?.();
      },
      onCancel: () => {
        asking.current = false;
        blocker.reset?.();
      },
    });
  }, [blocker, modal]);

  useBeforeUnload(dirty);

  const value = useMemo(() => ({ setDirty }), [setDirty]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Reporta los cambios sin guardar de un formulario. Sin proveedor, al menos avisa al cerrar la pestaña. */
export function useUnsavedChanges(dirty: boolean): void {
  const ctx = useContext(Ctx);
  const key = useId();
  useEffect(() => {
    ctx?.setDirty(key, dirty);
  }, [ctx, key, dirty]);
  useEffect(() => () => ctx?.setDirty(key, false), [ctx, key]);
  useBeforeUnload(!ctx && dirty);
}
