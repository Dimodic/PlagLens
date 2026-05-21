/**
 * React Query hooks for system / gateway info.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi } from '@/api/endpoints/system';

export const systemKeys = {
  servicesStatus: ['system', 'services-status'] as const,
  version: ['system', 'version'] as const,
  roles: ['system', 'roles'] as const,
  permissions: ['system', 'permissions'] as const,
  rolePermissions: (role: string) =>
    ['system', 'roles', role, 'permissions'] as const,
};

export function useServicesStatus() {
  return useQuery({
    queryKey: systemKeys.servicesStatus,
    queryFn: () => systemApi.servicesStatus(),
    refetchInterval: 30_000,
  });
}

export function useSystemVersion() {
  return useQuery({
    queryKey: systemKeys.version,
    queryFn: () => systemApi.version(),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: systemKeys.roles,
    queryFn: () => systemApi.listRoles(),
  });
}

export function usePermissionsCatalogue() {
  return useQuery({
    queryKey: systemKeys.permissions,
    queryFn: () => systemApi.permissionsCatalogue(),
    staleTime: 5 * 60_000,
  });
}

export function useRolePermissions(role: string | undefined) {
  return useQuery({
    queryKey: systemKeys.rolePermissions(role ?? ''),
    queryFn: () => systemApi.rolePermissions(role as string),
    enabled: !!role,
  });
}

export function useUpdateRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissions }: { role: string; permissions: string[] }) =>
      systemApi.updateRolePermissions(role, permissions),
    onSuccess: (data) => {
      qc.setQueryData(systemKeys.rolePermissions(data.role), data);
    },
  });
}
