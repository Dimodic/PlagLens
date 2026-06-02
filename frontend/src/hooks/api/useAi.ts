/**
 * React Query hooks for the AI Analysis Service.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aiApi,
  type CurateAsFeedbackBody,
  type RegenerateBody,
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
  opts: { forcePoll?: boolean } = {},
) {
  return useQuery({
    queryKey: ['ai', 'analyses', 'assignment', assignmentId, params],
    queryFn: () => aiApi.listForAssignment(assignmentId!, params),
    enabled: !!assignmentId,
    // Poll while a batch is still processing so the list fills in live
    // (queued → running → done/error), then stop. ``forcePoll`` keeps the
    // poll alive during the window right after a batch is triggered — the
    // backend creates analyses one by one, so there can be moments with no
    // queued/running row loaded yet while more are still being created;
    // without this the list freezes mid-batch and only a manual reload
    // shows the rest.
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? [];
      const active = rows.some(
        (a) => a.status === 'queued' || a.status === 'running',
      );
      return active || opts.forcePoll ? 2500 : false;
    },
  });
}

/** Run AI analysis for a batch of submissions of an assignment (staff). */
export function useBatchAnalyze(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { submission_ids: string[]; course_id?: string }) =>
      aiApi.batchCreate(
        assignmentId,
        { scope: 'all', submission_ids: vars.submission_ids },
        vars.course_id,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['ai', 'analyses', 'assignment', assignmentId],
      });
    },
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

// -------------------- Per-user provider connections --------------------

const myProvidersKey = ['ai', 'me', 'providers'] as const;

export function useMyAiProviders(enabled = true) {
  return useQuery({
    queryKey: myProvidersKey,
    queryFn: () => aiApi.myProviders.list(),
    enabled,
  });
}

export function useCreateMyAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      provider: string;
      model: string;
      api_key: string;
      base_url?: string;
      activate?: boolean;
      system_prompt?: string;
    }) => aiApi.myProviders.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: myProvidersKey }),
  });
}

export function useUpdateMyAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { model?: string; api_key?: string; system_prompt?: string };
    }) => aiApi.myProviders.update(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: myProvidersKey }),
  });
}

export function useDefaultAiPrompt(enabled = true) {
  return useQuery({
    queryKey: ['ai', 'me', 'prompt-default'],
    queryFn: () => aiApi.myProviders.defaultPrompt(),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

export function useActivateMyAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiApi.myProviders.activate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: myProvidersKey }),
  });
}

export function useDeleteMyAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiApi.myProviders.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: myProvidersKey }),
  });
}
