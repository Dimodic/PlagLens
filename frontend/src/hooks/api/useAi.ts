/**
 * React Query hooks for the AI Analysis Service.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aiApi,
  type CurateAsFeedbackBody,
  type RegenerateBody,
  type ProviderConfig,
  type BudgetConfig,
} from '@/api/endpoints/ai';
import type { ListParams } from '@/api/pagination';

const idem = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

// ---------- Queries ----------

// AI analyses, once completed, are immutable. Keep them fresh for
// 5 min so the grader walking back through 10 submissions doesn't
// trigger 10 re-fetches per page. Mutations (useStartAnalysis,
// useRegenerate) explicitly invalidate the key, so this is safe.
const AI_STALE_MS = 5 * 60_000;

export function useAnalyses(
  submissionId: string | undefined,
  params: ListParams = {},
  opts: { enabled?: boolean } = {},
) {
  // The full analyses list is only used by the AI version navigator
  // ("1/N" with prev/next arrows). For most submissions there's at
  // most one analysis, so the navigator is invisible — fetching the
  // list eagerly burns a connection slot for nothing. Callers opt in
  // by passing `enabled: true` once the navigator becomes relevant
  // (e.g. when the user clicks the back-arrow to see an older run).
  return useQuery({
    queryKey: ['ai', 'analyses', 'submission', submissionId, params],
    queryFn: ({ signal }) =>
      aiApi.listForSubmission(submissionId!, params, signal),
    enabled: !!submissionId && (opts.enabled ?? true),
    staleTime: AI_STALE_MS,
  });
}

export function useLatestAnalysis(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'analysis', 'latest', submissionId],
    queryFn: ({ signal }) =>
      aiApi.getLatestForSubmission(submissionId!, signal),
    enabled: !!submissionId,
    staleTime: AI_STALE_MS,
    // Poll while the latest analysis is in-flight so the UI advances
    // from "Выполняется…" to "Готов" without a manual refresh.
    // (Polling overrides staleTime — `refetchInterval` ticks regardless.)
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 3000 : false;
    },
  });
}

export function useAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'analysis', id],
    queryFn: () => aiApi.getAnalysis(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 3000 : false;
    },
  });
}

export function useAnalysesForAssignment(
  assignmentId: string | undefined,
  params: ListParams = {},
) {
  return useQuery({
    queryKey: ['ai', 'analyses', 'assignment', assignmentId, params],
    queryFn: () => aiApi.listForAssignment(assignmentId!, params),
    enabled: !!assignmentId,
  });
}

export function usePromptVersions(params: ListParams = {}) {
  return useQuery({
    queryKey: ['ai', 'prompt-versions', params],
    queryFn: () => aiApi.listPromptVersions(params),
  });
}

export function usePromptVersion(id: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'prompt-version', id],
    queryFn: () => aiApi.getPromptVersion(id!),
    enabled: !!id,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ['ai', 'providers'],
    queryFn: () => aiApi.listProviders(),
  });
}

export function useTenantBudget(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'budget', 'tenant', tenantId],
    queryFn: () => aiApi.getTenantBudget(tenantId!),
    enabled: !!tenantId,
  });
}

export function useCourseBudget(courseId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'budget', 'course', courseId],
    queryFn: () => aiApi.getCourseBudget(courseId!),
    enabled: !!courseId,
  });
}

export function useTenantUsage(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'usage', 'tenant', tenantId],
    queryFn: () => aiApi.getTenantUsage(tenantId!),
    enabled: !!tenantId,
  });
}

export function useCourseUsage(courseId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'usage', 'course', courseId],
    queryFn: () => aiApi.getCourseUsage(courseId!),
    enabled: !!courseId,
  });
}

export function useCacheStats() {
  return useQuery({
    queryKey: ['ai', 'cache', 'stats'],
    queryFn: () => aiApi.getCacheStats(),
  });
}

// ---------- Mutations ----------

export function useStartAnalysis(submissionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      prompt_version?: string;
      provider?: string;
      force_no_cache?: boolean;
      code?: string;
      course_id?: string;
      assignment_id?: string;
      language?: string;
      assignment_title?: string;
      assignment_description?: string;
    }) => {
      const { course_id, assignment_id, language, ...body } = vars;
      return aiApi.startAnalysis(submissionId, body, idem(), {
        course_id,
        assignment_id,
        language,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'analyses', 'submission', submissionId] });
      void qc.invalidateQueries({ queryKey: ['ai', 'analysis', 'latest', submissionId] });
    },
  });
}

export function useRegenerate(analysisId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegenerateBody) =>
      aiApi.regenerate(analysisId, body, idem()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'analysis', analysisId] });
      void qc.invalidateQueries({ queryKey: ['ai', 'analyses'] });
    },
  });
}

export function useCancelAnalysis(analysisId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.cancel(analysisId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'analysis', analysisId] });
    },
  });
}

export function useCurateAsFeedback(analysisId: string) {
  return useMutation({
    mutationFn: (body: CurateAsFeedbackBody) => aiApi.curateAsFeedback(analysisId, body),
  });
}

export function useShareWithStudent(analysisId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.shareWithStudent(analysisId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'analysis', analysisId] });
    },
  });
}

export function useUnshare(analysisId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.unshare(analysisId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'analysis', analysisId] });
    },
  });
}

export function useActivatePromptVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiApi.activatePromptVersion(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'prompt-versions'] });
    },
  });
}

export function useTestPromptVersion(id: string) {
  return useMutation({
    mutationFn: (vars: { code: string; language: string }) =>
      aiApi.testPromptVersion(id, vars),
  });
}

export function useTestProvider() {
  return useMutation({
    mutationFn: (id: string) => aiApi.testProvider(id),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<ProviderConfig> }) =>
      aiApi.updateProvider(vars.id, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'providers'] });
    },
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof aiApi.createProvider>[0]) =>
      aiApi.createProvider(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'providers'] });
    },
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiApi.deleteProvider(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'providers'] });
    },
  });
}

export function useSetProviderDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiApi.setProviderDefault(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'providers'] });
    },
  });
}

export function useUpdateTenantBudget(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<BudgetConfig>) => aiApi.updateTenantBudget(tenantId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'budget', 'tenant', tenantId] });
    },
  });
}

export function useUpdateCourseBudget(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<BudgetConfig>) => aiApi.updateCourseBudget(courseId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'budget', 'course', courseId] });
    },
  });
}

export function usePurgeCache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars:
      | { kind: 'all' }
      | { kind: 'prompt'; id: string }
      | { kind: 'submission'; id: string }) => {
      if (vars.kind === 'all') return aiApi.purgeCacheAll();
      if (vars.kind === 'prompt') return aiApi.purgeCacheByPromptVersion(vars.id);
      return aiApi.purgeCacheBySubmission(vars.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'cache'] });
    },
  });
}
