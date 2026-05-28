/**
 * React Query hooks for integrations.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  integrationsApi,
  type CreateIntegrationInput,
  type CreateScheduleInput,
  type IntegrationListFilters,
  type SyncInput,
  type UpdateIntegrationInput,
  type WebhookEvent,
} from '@/api/endpoints/integrations';
import type { ListParams } from '@/api/pagination';

export const integrationKeys = {
  all: ['integrations'] as const,
  list: (filters: IntegrationListFilters) => ['integrations', 'list', filters] as const,
  detail: (id: string) => ['integrations', 'detail', id] as const,
  importJobs: (id: string, params: ListParams) =>
    ['integrations', id, 'import-jobs', params] as const,
  schedules: (id: string) => ['integrations', id, 'schedules'] as const,
  webhookEvents: (params: ListParams & { kind?: WebhookEvent['kind'] }) =>
    ['integrations', 'webhook-events', params] as const,
  health: ['integrations', 'health'] as const,
  dlq: (params: ListParams) => ['integrations', 'dlq', params] as const,
  telegramSettings: ['integrations', 'telegram-settings'] as const,
};

export function useIntegrations(filters: IntegrationListFilters = {}) {
  return useQuery({
    queryKey: integrationKeys.list(filters),
    queryFn: () => integrationsApi.list(filters),
  });
}

export function useIntegration(id: string | undefined) {
  return useQuery({
    queryKey: integrationKeys.detail(id ?? ''),
    queryFn: () => integrationsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIntegrationInput) => integrationsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useUpdateIntegration(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateIntegrationInput) => integrationsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.delete(id),
    // Optimistic: drop the row from every cached list immediately so
    // the UI doesn't keep showing a deleted integration. Global query
    // defaults (`staleTime: 60s`, `placeholderData: keepPreviousData`)
    // were sometimes serving the stale list on the refetch that follows
    // — the user saw the row stick around until F5. Patching the cache
    // is instant and survives those defaults.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: integrationKeys.all });
      // Also stop the per-config import-jobs polling. ActivitySummary's
      // useQueries fires on every entry in the list with a 15s interval;
      // after deletion the next tick hits a row that no longer exists
      // and the gateway responds 404 → a red «not found» toast pops up
      // for no reason.
      qc.cancelQueries({ queryKey: ['integration', id] });
      qc.removeQueries({ queryKey: ['integration', id] });

      qc.setQueriesData<{ data?: Array<{ id: string }> }>(
        { queryKey: ['integrations', 'list'] },
        (old) => {
          if (!old || !Array.isArray(old.data)) return old;
          return { ...old, data: old.data.filter((r) => r.id !== id) };
        },
      );
    },
    // Re-fetch the server's authoritative copy in case our optimistic
    // patch and the backend disagree (e.g. multi-tab edits).
    onSettled: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: (id: string) => integrationsApi.test(id),
  });
}

export function useEnableIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.enable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useDisableIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useSyncNow(id: string) {
  return useMutation({
    mutationFn: (input: SyncInput = {}) => integrationsApi.syncNow(id, input),
  });
}

export function useImportJobs(id: string | undefined, params: ListParams = {}) {
  return useQuery({
    queryKey: integrationKeys.importJobs(id ?? '', params),
    queryFn: () => integrationsApi.listImportJobs(id as string, params),
    enabled: !!id,
  });
}

export function useSchedules(id: string | undefined) {
  return useQuery({
    queryKey: integrationKeys.schedules(id ?? ''),
    queryFn: () => integrationsApi.listSchedules(id as string),
    enabled: !!id,
  });
}

export function useCreateSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      integrationsApi.createSchedule(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: integrationKeys.schedules(id) }),
  });
}

export function useDeleteSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schedule_id: string) =>
      integrationsApi.deleteSchedule(id, schedule_id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: integrationKeys.schedules(id) }),
  });
}

export function useWebhookEvents(
  params: ListParams & { kind?: WebhookEvent['kind'] } = {},
) {
  return useQuery({
    queryKey: integrationKeys.webhookEvents(params),
    queryFn: () => integrationsApi.listWebhookEvents(params),
  });
}

export function useTelegramConfig() {
  return useQuery({
    queryKey: integrationKeys.telegramSettings,
    queryFn: () => integrationsApi.getTelegramBotSettings(),
  });
}

export function useIntegrationsHealth() {
  return useQuery({
    queryKey: integrationKeys.health,
    queryFn: () => integrationsApi.health(),
  });
}

export function useIntegrationsDlq(params: ListParams = {}) {
  return useQuery({
    queryKey: integrationKeys.dlq(params),
    queryFn: () => integrationsApi.dlq(params),
  });
}

export function useOauthStartIntegration() {
  return useMutation({
    mutationFn: (id: string) => integrationsApi.oauthStart(id),
  });
}

/** Admin: paste a Google Service Account JSON and create / replace the
 *  tenant-level google_sheets IntegrationConfig. Reporting picks it up
 *  via the s2s ``active-sa-json`` endpoint on the next export. */
export function useGoogleSheetsSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { display_name?: string; sa_json: string }) =>
      integrationsApi.googleSheetsSetup(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}

/** Iter 3: teacher uploads their OWN Service Account JSON — personal,
 *  doesn't touch the tenant-wide SA. */
export function useGoogleSheetsPersonalSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { display_name?: string; sa_json: string }) =>
      integrationsApi.googleSheetsPersonalSetup(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}
