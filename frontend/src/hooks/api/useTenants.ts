/**
 * React Query hooks for tenants.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  tenantsApi,
  type CreateTenantInput,
  type TenantSettings,
  type UpdateTenantInput,
} from '@/api/endpoints/tenants';
import type { ListParams } from '@/api/pagination';

export const tenantKeys = {
  all: ['tenants'] as const,
  list: (params: ListParams) => ['tenants', 'list', params] as const,
  detail: (id: string) => ['tenants', 'detail', id] as const,
  settings: (id: string) => ['tenants', id, 'settings'] as const,
  usage: (id: string) => ['tenants', id, 'usage'] as const,
};

export function useTenants(params: ListParams = {}) {
  return useQuery({
    queryKey: tenantKeys.list(params),
    queryFn: () => tenantsApi.list(params),
  });
}

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.detail(id ?? ''),
    queryFn: () => tenantsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => tenantsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.all }),
  });
}

export function useUpdateTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) => tenantsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tenantKeys.all });
    },
  });
}

export function useUpdateTenantSettings(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<TenantSettings>) =>
      tenantsApi.updateSettings(id, settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantKeys.settings(id) });
      qc.invalidateQueries({ queryKey: tenantKeys.detail(id) });
    },
  });
}

export function useTenantSettings(id: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.settings(id ?? ''),
    queryFn: () => tenantsApi.getSettings(id as string),
    enabled: !!id,
  });
}

export function useTenantUsage(id: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.usage(id ?? ''),
    queryFn: () => tenantsApi.usage(id as string),
    enabled: !!id,
  });
}

export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantsApi.suspend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.all }),
  });
}

export function useActivateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantsApi.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tenantKeys.all }),
  });
}
