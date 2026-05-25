/**
 * React Query hook for the admin OAuth provider directory.
 */
import { useQuery } from '@tanstack/react-query';
import { adminOAuthApi } from '@/api/endpoints/adminOAuth';

export const adminOAuthKeys = {
  providers: ['admin', 'oauth', 'providers'] as const,
};

export function useOAuthProviders() {
  return useQuery({
    queryKey: adminOAuthKeys.providers,
    queryFn: () => adminOAuthApi.listProviders(),
    staleTime: 30_000,
  });
}
