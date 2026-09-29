import { useQuery, type QueryClient } from '@tanstack/react-query';
import { publicApi } from '../lib/publicApi';
import { qk } from './queryKeys';

export function useDjCards() {
  return useQuery({ queryKey: qk.publicDjs, queryFn: ({ signal }) => publicApi.listDjs(signal) });
}

export function useDjProfile(slug: string | null) {
  return useQuery({
    queryKey: qk.publicDj(slug ?? ''),
    queryFn: ({ signal }) => publicApi.getDj(slug ?? '', signal),
    enabled: !!slug,
  });
}

/** Al pasar sobre una tarjeta del index se precarga la página del DJ. */
export function prefetchDj(client: QueryClient, slug: string): void {
  void client.prefetchQuery({ queryKey: qk.publicDj(slug), queryFn: ({ signal }) => publicApi.getDj(slug, signal) });
}
