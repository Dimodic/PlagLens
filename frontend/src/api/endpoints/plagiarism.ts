/**
 * Plagiarism Service API client.
 *
 * See docs/architecture/legacy/08-PLAGIARISM.md.
 */
import api from '../client';
import type { Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// ---------- Domain types ----------

export type PlagiarismProvider = 'jplag' | 'moss' | 'dolos' | 'codequiry';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type FlagSeverity = 'low' | 'medium' | 'high';

export interface PlagiarismRunOptions {
  min_tokens?: number;
  similarity_threshold?: number;
  include_versions?: 'selected' | 'all_versions' | 'latest_per_student';
  languages_filter?: string[];
}

export interface AuthorBrief {
  id: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface PlagiarismRun {
  id: string;
  tenant_id: string;
  course_id: string;
  assignment_id: string | null;
  provider: PlagiarismProvider;
  provider_run_id?: string | null;
  status: RunStatus;
  trigger: 'manual' | 'auto_after_import' | 'scheduled';
  scope: { assignment_ids: string[]; with_corpus: boolean };
  options: PlagiarismRunOptions;
  started_at: string | null;
  finished_at: string | null;
  submissions_count: number;
  pairs_total: number;
  pairs_suspected: number;
  max_similarity: number;
  artifact_html_uri?: string | null;
  artifact_json_uri?: string | null;
  artifact_archive_uri?: string | null;
  triggered_by?: string | null;
  error?: { title: string; detail?: string } | null;
  created_at: string;
}

export interface PlagiarismRunSummary {
  max_similarity: number;
  mean_similarity: number;
  pairs_total: number;
  pairs_suspected: number;
  clusters_count: number;
  languages: Record<string, number>;
}

export interface PlagiarismRunReport {
  run_id: string;
  assignment_id: string | null;
  provider: PlagiarismProvider;
  status: RunStatus;
  submissions_count: number;
  summary: PlagiarismRunSummary;
  started_at: string | null;
  finished_at: string | null;
  options_used: PlagiarismRunOptions;
  artifacts: {
    html_url?: string | null;
    json_url?: string | null;
    archive_url?: string | null;
  };
}

export interface PlagiarismPair {
  id: string;
  run_id: string;
  a_submission_id: string;
  b_submission_id: string;
  a_author: AuthorBrief;
  b_author: AuthorBrief;
  similarity: number;
  matched_tokens: number;
  fragments_count: number;
  cross_course: boolean;
  cross_assignment: boolean;
  evidence_url: string;
}

export interface PlagiarismPairFragment {
  a_file: string;
  a_start_line: number;
  a_end_line: number;
  b_file: string;
  b_start_line: number;
  b_end_line: number;
  a_content: string;
  b_content: string;
}

export interface PlagiarismPairDetail {
  id: string;
  run_id: string;
  similarity: number;
  matched_tokens: number;
  fragments_count: number;
  fragments: PlagiarismPairFragment[];
  submissions: {
    a: { submission_id: string; author: AuthorBrief; language: string };
    b: { submission_id: string; author: AuthorBrief; language: string };
  };
}

export interface PlagiarismCluster {
  id: string;
  run_id: string;
  members: string[];
  member_authors?: AuthorBrief[];
  avg_similarity: number;
  dominant_language: string;
}

export interface CorpusStats {
  tenant_id: string;
  entries_count: number;
  by_language: Record<string, number>;
  by_course: Array<{
    course_id: string;
    course_slug?: string;
    course_name?: string;
    entries: number;
  }>;
  last_rebuild_at?: string | null;
}

export interface SuspiciousSubmission {
  flag_id: string;
  submission_id: string;
  // The plagiarism backend doesn't always have these — the course-list
  // endpoint enriches them via a parallel fan-out to the submission
  // service, but the assignment/submission endpoints leave them empty.
  // Treat as optional so the resolver can fall back.
  author?: AuthorBrief;
  author_id?: string | null;
  author_display_name?: string | null;
  assignment_id?: string | null;
  assignment_title?: string;
  /** Per-peer identity for IDs in `paired_with`. Filled by the course
   *  list endpoint via the submission-service fan-out. */
  paired_with_authors?: Array<{
    submission_id: string;
    author_id: string | null;
    display_name: string | null;
  }>;
  reason: string;
  severity: FlagSeverity;
  similarity: number | null;
  paired_with: string[];
  /** Plagiarism run that produced this flag. Optional — manual flags
   *  have no run_id. */
  run_id?: string | null;
  created_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
}

export interface PairsListParams extends ListParams {
  min_similarity?: number;
  cross_course?: boolean;
  sort?: string;
}

export interface SuspiciousListParams extends ListParams {
  severity?: FlagSeverity | '';
  assignment_id?: string;
  dismissed?: 'active' | 'dismissed' | 'all';
}

export interface StartRunBody {
  provider?: PlagiarismProvider;
  with_corpus?: boolean;
  options?: PlagiarismRunOptions;
}

export interface AcceptedOperation {
  operation_id: string;
  status_url: string;
}

// ---------- API ----------

export const plagiarismApi = {
  // A. Runs
  listRuns: (assignmentId: string, params: ListParams = {}) =>
    api
      .get<Paginated<PlagiarismRun>>(
        `/assignments/${assignmentId}/plagiarism-runs`,
        { params: buildListParams(params) },
      )
      .then((r) => r.data),

  getRun: (runId: string) =>
    api.get<PlagiarismRun>(`/plagiarism-runs/${runId}`).then((r) => r.data),

  startRun: (
    assignmentId: string,
    body: StartRunBody,
    idempotencyKey: string,
    courseId?: string,
  ) =>
    api
      .post<AcceptedOperation>(
        `/assignments/${assignmentId}/plagiarism-runs`,
        body,
        {
          headers: { 'Idempotency-Key': idempotencyKey },
          // course_id feeds the backend's RBAC ``assert_course_role``
          // check. Required for non-admin users.
          params: courseId ? { course_id: courseId } : undefined,
        },
      )
      .then((r) => r.data),

  cancelRun: (runId: string) =>
    api.post<AcceptedOperation>(`/plagiarism-runs/${runId}:cancel`).then((r) => r.data),

  retryRun: (runId: string, idempotencyKey: string) =>
    api
      .post<AcceptedOperation>(
        `/plagiarism-runs/${runId}:retry`,
        {},
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .then((r) => r.data),

  deleteRun: (runId: string) => api.delete(`/plagiarism-runs/${runId}`).then((r) => r.data),

  // B. Reports
  getReport: (runId: string) =>
    api.get<PlagiarismRunReport>(`/plagiarism-runs/${runId}/report`).then((r) => r.data),

  listPairs: (runId: string, params: PairsListParams = {}) => {
    const out = buildListParams(params);
    if (params.min_similarity != null) out.min_similarity = params.min_similarity;
    if (params.cross_course != null) out.cross_course = String(params.cross_course);
    return api
      .get<Paginated<PlagiarismPair>>(`/plagiarism-runs/${runId}/pairs`, { params: out })
      .then((r) => r.data);
  },

  getPairDetail: (runId: string, pairId: string) =>
    api
      .get<PlagiarismPairDetail>(`/plagiarism-runs/${runId}/pairs/${pairId}`)
      .then((r) => r.data),

  listClusters: (runId: string, params: ListParams = {}) =>
    api
      .get<Paginated<PlagiarismCluster>>(`/plagiarism-runs/${runId}/clusters`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  // Pairs whose both submissions belong to one cluster — used to
  // lazy-load a cluster's comparisons when its card is expanded.
  // Returns ``{ data: PlagiarismPair[] }`` (no pagination).
  listClusterPairs: (runId: string, clusterId: string) =>
    api
      .get<{ data: PlagiarismPair[] }>(
        `/plagiarism-runs/${runId}/clusters/${clusterId}/pairs`,
      )
      .then((r) => r.data.data),

  getArtifactUrl: (runId: string, kind: 'html' | 'json' | 'archive') =>
    api
      .get<{ url: string; expires_at: string }>(
        `/plagiarism-runs/${runId}/artifacts/${kind}`,
      )
      .then((r) => r.data),

  // D. Corpus (admin)
  getCorpusStats: () =>
    api.get<CorpusStats>('/plagiarism-corpus').then((r) => r.data),

  rebuildCorpus: (idempotencyKey: string) =>
    api
      .post<AcceptedOperation>(
        '/plagiarism-corpus:rebuild',
        {},
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .then((r) => r.data),

  // E. Suspicious
  listSuspicious: (courseSlugOrId: string, params: SuspiciousListParams = {}) => {
    const out = buildListParams(params);
    if (params.severity) out.severity = params.severity;
    if (params.assignment_id) out.assignment_id = params.assignment_id;
    if (params.dismissed) out.dismissed = params.dismissed;
    return api
      .get<Paginated<SuspiciousSubmission>>(`/courses/${courseSlugOrId}/suspicious-submissions`, {
        params: out,
      })
      .then((r) => r.data);
  },

  dismissFlag: (submissionId: string, flagId: string, reason?: string) =>
    api
      .post(`/submissions/${submissionId}/suspicious-flags/${flagId}:dismiss`, { reason })
      .then((r) => r.data),

  setFlagSeverity: (submissionId: string, flagId: string, severity: FlagSeverity) =>
    api
      .patch(`/submissions/${submissionId}/suspicious-flags/${flagId}`, { severity })
      .then((r) => r.data),
};
