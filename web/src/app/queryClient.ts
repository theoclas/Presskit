import { QueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../lib/publicApi';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // El contenido público cambia poco; 5 min evita recargas al ir y volver del index.
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
