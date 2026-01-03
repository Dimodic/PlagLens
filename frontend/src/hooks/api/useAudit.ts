/**
 * React Query hooks for audit.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  auditApi,
  type AuditFilters,
  type AuditSearchBody,
  type RetentionPolicy,
} from '@/api/endpoints/audit';
import type { ListParams } from '@/api/pagination';

export const auditKeys = {
  all: ['audit'] as const,
  list: (filters: AuditFilters) => ['audit', 'list', filters] as const,
  detail: (id: string) => ['audit', 'detail', id] as const,
  search: (body: AuditSearchBody) => ['audit', 'search', body] as const,
  byActor: (user_id: string, params: ListParams) =>
    ['audit', 'by-actor', user_id, params] as const,
  byResource: (rt: string, rid: string, params: ListParams) =>
    ['audit', 'by-resource', rt, rid, params] as const,
  accessDenied: (params: ListParams) => ['audit', 'access-denied', params] as const,
  retentionPolicy: ['audit', 'retention-policy'] as const,
  retentionStatus: ['audit', 'retention-status'] as const,
  legalHolds: ['audit', 'legal-holds'] as const,
};

export function useAuditEvents(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => auditApi.list(filters),
  });
}

export function useAuditEvent(id: string | undefined) {
  return useQuery({
    queryKey: auditKeys.detail(id ?? ''),
    queryFn: () => auditApi.get(id as string),
    enabled: !!id,
  });
}

export function useAuditSearch() {
  return useMutation({
    mutationFn: (body: AuditSearchBody) => auditApi.search(body),
  });
}

export function useAuditByActor(user_id: string | undefined, params: ListParams = {}) {
  return useQuery({
    queryKey: auditKeys.byActor(user_id ?? '', params),
    queryFn: () => auditApi.byActor(user_id as string, params),
    enabled: !!user_id,
  });
}

export function useAuditByResource(
  resource_type: string | undefined,
  resource_id: string | undefined,
  params: ListParams = {},
) {
  return useQuery({
    queryKey: auditKeys.byResource(
      resource_type ?? '',
      resource_id ?? '',
      params,
    ),
    queryFn: () =>
      auditApi.byResource(resource_type as string, resource_id as string, params),
    enabled: !!resource_type && !!resource_id,
  });
}

export function useAuditAccessDenied(params: ListParams = {}) {
  return useQuery({
    queryKey: auditKeys.accessDenied(params),
    queryFn: () => auditApi.accessDenied(params),
  });
}

export function useExportAuditCsv() {
  return useMutation({
    mutationFn: (filters: Partial<Omit<AuditFilters, 'limit' | 'cursor'>> = {}) =>
      auditApi.exportEvents({ format: 'csv', filters }),
  });
}

export function useRetentionPolicy() {
  return useQuery({
    queryKey: auditKeys.retentionPolicy,
    queryFn: () => auditApi.getRetentionPolicy(),
  });
}

export function useUpdateRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<
        Omit<RetentionPolicy, 'scope' | 'scope_id' | 'updated_at' | 'updated_by'>
      >,
    ) => auditApi.updateRetentionPolicy(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: auditKeys.retentionPolicy }),
  });
}

export function useLegalHolds() {
  return useQuery({
    queryKey: auditKeys.legalHolds,
    queryFn: () => auditApi.listLegalHolds(),
  });
}

export function useCreateLegalHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { resource_id: string; reason: string }) =>
      auditApi.createLegalHold(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: auditKeys.legalHolds }),
  });
}

export function useDeleteLegalHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => auditApi.deleteLegalHold(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: auditKeys.legalHolds }),
  });
}
