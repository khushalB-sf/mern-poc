import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ME_KEY } from '../features/auth/hooks';
import { ApiError } from '../shared/api/client';

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // The API already tried to refresh the session. A 401 here means it is really over:
        // mark the user signed out and RequireAuth redirects to the login page.
        if (error instanceof ApiError && error.status === 401 && query.queryKey[0] !== 'me') {
          client.setQueryData(ME_KEY, null);
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Client errors (400-499) will not change on retry; only retry transient failures.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}
