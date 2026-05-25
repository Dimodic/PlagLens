/**
 * React Query hooks for admin-managed integration OAuth apps.
 *
 * NB: this is the import-side counterpart of useAdminOAuth (which
 * targets identity's login providers). Keep them straight — admins
 * configure both, but the URLs and tables are different.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminIntegrationsOauthApi,
  type IntegrationOAuthKind,
  type IntegrationOAuthUpsertInput,
} from '@/api/endpoints/adminIntegrationsOauth';

export const adminIntegrationsOauthKeys = {
  list: ['admin', 'integrations', 'oauth-providers'] as const,
};

export function useIntegrationOAuthProviders() {
  return useQuery({
    queryKey: adminIntegrationsOauthKeys.list,
    queryFn: () => adminIntegrationsOauthApi.list(),
    staleTime: 30_000,
  });
}

export function useUpsertIntegrationOAuthProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      payload,
    }: {
      kind: IntegrationOAuthKind;
      payload: IntegrationOAuthUpsertInput;
    }) => adminIntegrationsOauthApi.upsert(kind, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminIntegrationsOauthKeys.list });
    },
  });
}

export function useDeleteIntegrationOAuthProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: IntegrationOAuthKind) =>
      adminIntegrationsOauthApi.remove(kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminIntegrationsOauthKeys.list });
    },
  });
}
