/**
 * React Query hooks for the admin OAuth provider directory.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminOAuthApi, type OAuthProviderUpdate } from '@/api/endpoints/adminOAuth';

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

export function useUpdateOAuthProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      payload,
    }: {
      provider: string;
      payload: OAuthProviderUpdate;
    }) => adminOAuthApi.update(provider, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminOAuthKeys.providers });
    },
  });
}
