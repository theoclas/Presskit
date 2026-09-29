import type { AdminProfileListItemDto, Paginated, ProfileStatus } from '@fersua/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { editorKeys } from '../../editor-kit/scope';
import { http } from '../../lib/http';
import { cleanParams } from '../format';

export const PROFILES_PAGE_SIZE = 20;

export interface ProfileFilters {
  status?: ProfileStatus;
  q?: string;
  page: number;
}

export const profileKeys = {
  list: (f: ProfileFilters) => ['admin', 'profiles', 'list', f] as const,
};

/** Base del api para editar un perfil como admin (la usa el editor compartido). */
export function adminProfileBase(id: string): string {
  return `/admin/profiles/${encodeURIComponent(id)}`;
}

export function useAdminProfiles(f: ProfileFilters, enabled = true) {
  return useQuery({
    queryKey: profileKeys.list(f),
    queryFn: async ({ signal }) =>
      (
        await http.get<Paginated<AdminProfileListItemDto>>('/admin/profiles', {
          params: cleanParams({ ...f, pageSize: PROFILES_PAGE_SIZE }),
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled,
  });
}

/** Después de una acción sobre un perfil: listas del admin + su editor. */
export function useRefreshProfile() {
  const client = useQueryClient();
  return useCallback(
    async (id: string, opts: { removed?: boolean } = {}) => {
      const base = adminProfileBase(id);
      if (opts.removed) {
        // Perfil borrado: si el editor sigue montado (la navegación a la lista aún no termina),
        // quitar sus consultas haría que las vuelva a pedir y el api respondería 404. Las activas
        // solo se cancelan (TanStack las recoge al desmontarse); las inactivas se quitan ya.
        await client.cancelQueries({ queryKey: editorKeys.all(base) });
        client.removeQueries({ queryKey: editorKeys.all(base), type: 'inactive' });
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin'] }),
        opts.removed ? Promise.resolve() : client.invalidateQueries({ queryKey: editorKeys.all(base) }),
        client.invalidateQueries({ queryKey: ['public'] }),
      ]);
    },
    [client],
  );
}
