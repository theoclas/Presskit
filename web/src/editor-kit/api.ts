import type { ApiErrorDto, EditorProfileDto } from '@fersua/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiError, http } from '../lib/http';
import { editorKeys, useEditorScope } from './scope';

export { http };

/** Mensajes propios para códigos que el api devuelve sin contexto suficiente para el editor. */
const CODE_MESSAGES: Record<string, string> = {
  QUOTA_EXCEEDED: 'Llegaste al límite de fotos de este perfil. Borra alguna que no uses e intenta de nuevo.',
  PAYLOAD_TOO_LARGE: 'La foto pesa demasiado: el máximo es 10 MB.',
  IMAGE_TOO_LARGE: 'La foto pesa demasiado: el máximo es 10 MB y 40 megapíxeles.',
  UPLOAD_BUSY: 'Estamos procesando otras fotos. Intenta de nuevo en unos segundos.',
  STORAGE_FULL: 'Por ahora no podemos guardar más fotos. Intenta más tarde.',
  LEGAL_INFO_REQUIRED: 'Falta el registro de datos legales (art. 53 Ley 1480). Cárgalo en «Datos legales» antes de aprobar.',
  SLUG_TAKEN: 'Esa dirección ya la usa otro perfil.',
  CANCELED: 'Se canceló la solicitud.',
  // Solo le pasa al dueño (M3): subir fotos exige el correo confirmado.
  EMAIL_NOT_VERIFIED: 'Para subir fotos primero confirma tu correo: abre el enlace que te enviamos o pide uno nuevo en el aviso de arriba.',
};

/** Códigos cuyo mensaje propio reemplaza siempre el del api. */
const ALWAYS_CUSTOM = new Set(['QUOTA_EXCEEDED', 'PAYLOAD_TOO_LARGE', 'LEGAL_INFO_REQUIRED', 'EMAIL_NOT_VERIFIED']);

/** ApiErrorDto con un mensaje listo para mostrar. */
export function describeError(err: unknown): ApiErrorDto & { canceled: boolean } {
  const e = apiError(err);
  const custom = CODE_MESSAGES[e.code];
  let message = e.message;
  if (custom && (ALWAYS_CUSTOM.has(e.code) || !message)) {
    message = custom;
  }
  if (e.statusCode === 409 && e.code === 'CONFLICT') {
    message = 'Otra persona modificó este perfil. Recarga para ver los cambios.';
  }
  return { ...e, message, canceled: e.code === 'CANCELED' };
}

/** Lista que puede llegar como arreglo o paginada ({ items }). */
export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

/** Perfil completo que editan todas las secciones. Sin refetch al volver a la pestaña: pisaría formularios abiertos. */
export function useEditorProfile() {
  const { base } = useEditorScope();
  return useQuery({
    queryKey: editorKeys.profile(base),
    queryFn: async ({ signal }) => (await http.get<EditorProfileDto>(base, { signal })).data,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Después de guardar: pone la respuesta en la caché (si es el perfil) e invalida el resto del
 * editor y las listas del admin, que muestran nombre, estado y foto.
 */
export function useAfterSave() {
  const client = useQueryClient();
  const { base } = useEditorScope();
  return useCallback(
    async (profile?: EditorProfileDto | null) => {
      const fresh = !!profile && typeof profile === 'object' && 'id' in profile && 'slug' in profile;
      if (fresh) client.setQueryData(editorKeys.profile(base), profile);
      await Promise.all([
        client.invalidateQueries({
          queryKey: editorKeys.all(base),
          // El perfil que acaba de responder el api ya está al día: no se vuelve a pedir.
          predicate: (q) => !(fresh && q.queryKey[2] === 'profile'),
        }),
        client.invalidateQueries({ queryKey: ['admin'] }),
        client.invalidateQueries({ queryKey: ['public'] }),
      ]);
    },
    [client, base],
  );
}
