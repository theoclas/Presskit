import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Sobre qué perfil trabaja el editor. Todas las secciones arman sus rutas con `base`:
 * - admin (M2): '/admin/profiles/<id>'
 * - dueño (M3): '/me/profile'
 * Así el mismo código sirve para los dos paneles y el api decide el alcance por el prefijo.
 */
export interface EditorScope {
  /** Prefijo de las rutas del api, relativo a /api, sin barra final. */
  base: string;
  /** Quién edita: cambia ayudas y lo que se permite (p. ej. fechas pasadas solo el admin). */
  actor: 'admin' | 'owner';
  /**
   * Ruta con la lista de géneros con id (GenreAdminDto[] o { items }). Sin ella el editor
   * muestra los géneros guardados pero no deja cambiarlos.
   */
  genresUrl?: string | null;
}

const EditorScopeContext = createContext<EditorScope | null>(null);

interface ProviderProps extends EditorScope {
  children: ReactNode;
}

export function EditorScopeProvider({ base, actor, genresUrl = null, children }: ProviderProps) {
  const value = useMemo<EditorScope>(
    () => ({ base: base.replace(/\/+$/, ''), actor, genresUrl }),
    [base, actor, genresUrl],
  );
  return <EditorScopeContext.Provider value={value}>{children}</EditorScopeContext.Provider>;
}

export function useEditorScope(): EditorScope {
  const scope = useContext(EditorScopeContext);
  if (!scope) throw new Error('useEditorScope necesita <EditorScopeProvider>');
  return scope;
}

/** Claves de TanStack Query del editor, todas bajo el mismo prefijo para invalidar de una vez. */
export const editorKeys = {
  all: (base: string) => ['editor', base] as const,
  profile: (base: string) => ['editor', base, 'profile'] as const,
  events: (base: string, scope: 'upcoming' | 'past') => ['editor', base, 'events', scope] as const,
  legal: (base: string) => ['editor', base, 'legal'] as const,
  genres: (url: string) => ['editor', 'genres', url] as const,
};
