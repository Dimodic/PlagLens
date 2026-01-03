/**
 * React Query hooks for the Plagiarism Service.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  plagiarismApi,
  type PairsListParams,
  type StartRunBody,
  type SuspiciousListParams,
  type FlagSeverity,
} from '@/api/endpoints/plagiarism';
import type { ListParams } from '@/api/pagination';

const idem = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

// ---------- Queries ----------

export function usePlagiarismRuns(assignmentId: string, params: ListParams = {}) {
  return useQuery({
    queryKey: ['plagiarism', 'runs', assignmentId, params],
    queryFn: () => plagiarismApi.listRuns(assignmentId, params),
    enabled: !!assignmentId,
    // Poll while there's a queued/running run in the list — drives the
    // "Плагиат: проверяется…" pill on the submission page so it flips
    // to "чисто/N" on its own. ``q.state.data`` is the paginated
    // payload, not a single run.
    refetchInterval: (q) => {
      const list = q.state.data?.data ?? [];
      const inFlight = list.some(
        (r) => r.status === 'queued' || r.status === 'running',
      );
      return inFlight ? 4000 : false;
    },
  });
}

export function usePlagiarismRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['plagiarism', 'run', runId],
    queryFn: () => plagiarismApi.getRun(runId!),
    enabled: !!runId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === 'queued' || status === 'running') return 4000;
      return false;
    },
  });
}

export function usePlagiarismReport(runId: string | undefined) {
  return useQuery({
    queryKey: ['plagiarism', 'report', runId],
    queryFn: () => plagiarismApi.getReport(runId!),
    enabled: !!runId,
  });
}

export function usePairs(
  runId: string | undefined,
  params: PairsListParams = {},
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['plagiarism', 'pairs', runId, params],
    queryFn: () => plagiarismApi.listPairs(runId!, params),
    enabled: !!runId && (opts.enabled ?? true),
  });
}

export function usePairDetail(runId: string | undefined, pairId: string | undefined) {
  return useQuery({
    queryKey: ['plagiarism', 'pair', runId, pairId],
    queryFn: () => plagiarismApi.getPairDetail(runId!, pairId!),
    enabled: !!runId && !!pairId,
  });
}

export function useClusters(
  runId: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['plagiarism', 'clusters', runId],
    queryFn: () => plagiarismApi.listClusters(runId!),
    enabled: !!runId && (opts.enabled ?? true),
  });
}

/** Pairs inside a single cluster — lazy, gated by ``enabled`` so the
 *  request only fires when the cluster card is expanded. */
export function useClusterPairs(
  runId: string | undefined,
  clusterId: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['plagiarism', 'cluster-pairs', runId, clusterId],
    queryFn: () => plagiarismApi.listClusterPairs(runId!, clusterId!),
    enabled: !!runId && !!clusterId && (opts.enabled ?? true),
  });
}

export function useArtifactUrl(
  runId: string | undefined,
  kind: 'html' | 'json' | 'archive',
  enabled = false,
) {
  return useQuery({
    queryKey: ['plagiarism', 'artifact', runId, kind],
    queryFn: () => plagiarismApi.getArtifactUrl(runId!, kind),
    enabled: enabled && !!runId,
    staleTime: 60_000,
  });
}

export function useCorpusStats() {
  return useQuery({
    queryKey: ['plagiarism', 'corpus', 'stats'],
    queryFn: () => plagiarismApi.getCorpusStats(),
  });
}

export function useSuspiciousSubmissions(
  courseSlugOrId: string | undefined,
  params: SuspiciousListParams = {},
) {
  return useQuery({
    queryKey: ['plagiarism', 'suspicious', courseSlugOrId, params],
    queryFn: () => plagiarismApi.listSuspicious(courseSlugOrId!, params),
    enabled: !!courseSlugOrId,
  });
}

// ---------- Mutations ----------

export function useRunPlagiarism(
  assignmentId: string,
  courseId?: string,
) {
  // ``courseId`` lands on the backend as a query param and feeds the
  // course-role RBAC check there. Without it the backend bounces the
  // request with 403 "Course context required" for any non-admin user
  // (the UI then shows the "плагиат недоступен" toast). The backend
  // also has a fallback that derives course_id from the assignment's
  // first submission, but explicit > implicit — pass it whenever the
  // caller has it on hand.
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StartRunBody) =>
      plagiarismApi.startRun(assignmentId, body, idem(), courseId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'runs', assignmentId] });
    },
  });
}

export function useCancelRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plagiarismApi.cancelRun(runId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'run', runId] });
    },
  });
}

export function useRetryRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plagiarismApi.retryRun(runId, idem()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'run', runId] });
    },
  });
}

/** Soft-delete a plagiarism run. Backend marks the row with
 *  ``deleted_at``; lists already filter it out, so the UI just needs
 *  to invalidate the assignment-runs cache to make it vanish. */
export function useDeleteRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plagiarismApi.deleteRun(runId),
    onSuccess: () => {
      // We don't know the assignmentId here, so invalidate the whole
      // ``plagiarism.runs`` tree — list pages refresh; the detail
      // query for this specific run is also evicted.
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'runs'] });
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'run', runId] });
    },
  });
}

export function useRebuildCorpus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plagiarismApi.rebuildCorpus(idem()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'corpus'] });
    },
  });
}

export function useDismissFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { submissionId: string; flagId: string; reason?: string }) =>
      plagiarismApi.dismissFlag(vars.submissionId, vars.flagId, vars.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'suspicious'] });
    },
  });
}

export function useSetFlagSeverity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { submissionId: string; flagId: string; severity: FlagSeverity }) =>
      plagiarismApi.setFlagSeverity(vars.submissionId, vars.flagId, vars.severity),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'suspicious'] });
    },
  });
}
