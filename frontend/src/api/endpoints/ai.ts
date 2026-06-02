/**
 * AI Analysis Service API client.
 *
 */
import api from '../client';
import type { Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// ---------- Domain types ----------

export type AnalysisStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type RiskSignalType =
  | 'style_jump'
  | 'generic_solution'
  | 'non_idiomatic'
  | 'complexity_jump'
  | 'library_misuse'
  | 'stub_code'
  | 'other';
export type RiskSeverity = 'low' | 'medium' | 'high';

export interface RiskSignal {
  type: RiskSignalType;
  severity: RiskSeverity;
  details: string;
  line_range?: [number, number] | null;
}

export interface PlagLensReport {
  /** Short student-facing message (≤30 words). May be empty for legacy
   * analyses produced before this field existed. */
  student_brief?: string;
  summary: string;
  risk_signals: RiskSignal[];
  questions: string[];
  recommendations: string[];
  metadata?: Record<string, unknown>;
}

export interface AIAnalysis {
  id: string;
  tenant_id: string;
  course_id: string;
  assignment_id: string;
  submission_id: string;
  prompt_version: string;
  provider: string;
  model: string;
  status: AnalysisStatus;
  trigger: 'auto' | 'manual' | 'regenerate';
  cache_hit: boolean;
  report: PlagLensReport | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_estimate: number; // USD
  latency_ms: number;
  parent_analysis_id: string | null;
  failure_reason: string | null;
  shared_with_student: boolean;
  curated_feedback_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  author?: {
    id: string;
    display_name: string;
  };
}

export interface AcceptedOperation {
  operation_id: string;
  status_url: string;
}

export interface RegenerateBody {
  prompt_version?: string;
  provider?: string;
  force_no_cache?: boolean;
}

export interface CurateAsFeedbackBody {
  edited_summary: string;
  include_risk_signals: RiskSignalType[];
  include_questions: number[];
  additional_text?: string;
  visible_to_student: boolean;
}

// ---------- API ----------

/** A staff member's own connected AI provider ("bring your own key"). */
export interface MyAiProvider {
  id: string;
  provider: string;
  model: string;
  base_url: string;
  active: boolean;
  has_key: boolean;
  /** Connector's own system-prompt override (null = standard prompt). */
  system_prompt?: string | null;
}

export interface MyAiModel {
  id: string;
  name: string;
}

export const aiApi = {
  // A. Analyses
  listForSubmission: (
    submissionId: string,
    params: ListParams = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<Paginated<AIAnalysis>>(`/submissions/${submissionId}/ai-analyses`, {
        params: buildListParams(params),
        signal,
      })
      .then((r) => r.data),

  getLatestForSubmission: (submissionId: string, signal?: AbortSignal) =>
    api
      .get<AIAnalysis>(`/submissions/${submissionId}/ai-analyses/latest`, {
        signal,
      })
      .then((r) => r.data),

  getAnalysis: (id: string) =>
    api.get<AIAnalysis>(`/ai-analyses/${id}`).then((r) => r.data),

  startAnalysis: (
    submissionId: string,
    body: {
      prompt_version?: string;
      provider?: string;
      force_no_cache?: boolean;
      /** Raw submission source. Sent in the request body (not a header) to
       * avoid hitting per-header size limits in the gateway/uvicorn. */
      code?: string;
      /** Task context — the submission page already has the assignment
       * loaded, so it forwards the title + problem statement. Lets the
       * LLM judge the code against the actual task, not a guess. */
      assignment_title?: string;
      assignment_description?: string;
    },
    idempotencyKey: string,
    query?: { course_id?: string; assignment_id?: string; language?: string },
  ) =>
    api
      .post<AcceptedOperation>(`/submissions/${submissionId}/ai-analyses`, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
        params: query,
      })
      .then((r) => r.data),

  regenerate: (analysisId: string, body: RegenerateBody, idempotencyKey: string) =>
    api
      .post<AcceptedOperation>(`/ai-analyses/${analysisId}:regenerate`, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      .then((r) => r.data),

  cancel: (analysisId: string) =>
    api.post<AcceptedOperation>(`/ai-analyses/${analysisId}:cancel`).then((r) => r.data),

  retry: (analysisId: string, idempotencyKey: string) =>
    api
      .post<AcceptedOperation>(
        `/ai-analyses/${analysisId}:retry`,
        {},
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .then((r) => r.data),

  // C. Curate
  curateAsFeedback: (analysisId: string, body: CurateAsFeedbackBody) =>
    api
      .post<{ feedback_id: string; submission_id: string }>(
        `/ai-analyses/${analysisId}:curate-as-feedback`,
        body,
      )
      .then((r) => r.data),

  shareWithStudent: (analysisId: string) =>
    api.post(`/ai-analyses/${analysisId}:share-with-student`).then((r) => r.data),

  unshare: (analysisId: string) =>
    api.post(`/ai-analyses/${analysisId}:unshare`).then((r) => r.data),

  // D. Batch (per-assignment)
  listForAssignment: (assignmentId: string, params: ListParams = {}) =>
    api
      .get<Paginated<AIAnalysis>>(`/assignments/${assignmentId}/ai-analyses`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  /** Run AI analysis for a set of submissions of an assignment (staff). */
  batchCreate: (
    assignmentId: string,
    body: {
      scope?: 'all' | 'selected' | 'suspicious_only';
      submission_ids?: string[];
      prompt_version?: string;
      provider?: string;
    },
    courseId?: string,
  ) =>
    api
      .post<AcceptedOperation>(
        `/assignments/${assignmentId}/ai-analyses:batchCreate`,
        body,
        courseId ? { params: { course_id: courseId } } : undefined,
      )
      .then((r) => r.data),

  // Per-user provider connections — teacher/assistant "bring your own key".
  myProviders: {
    list: () => api.get<MyAiProvider[]>(`/me/ai/providers`).then((r) => r.data),
    listModels: (body: {
      provider: string;
      api_key?: string;
      base_url?: string;
    }) =>
      api
        .post<MyAiModel[]>(`/me/ai/providers:listModels`, body)
        .then((r) => r.data),
    create: (body: {
      provider: string;
      model: string;
      api_key: string;
      base_url?: string;
      activate?: boolean;
      system_prompt?: string;
    }) => api.post<MyAiProvider>(`/me/ai/providers`, body).then((r) => r.data),
    update: (
      id: string,
      body: { model?: string; api_key?: string; system_prompt?: string },
    ) =>
      api.patch<MyAiProvider>(`/me/ai/providers/${id}`, body).then((r) => r.data),
    activate: (id: string) =>
      api
        .post<MyAiProvider>(`/me/ai/providers/${id}:activate`)
        .then((r) => r.data),
    remove: (id: string) =>
      api.delete(`/me/ai/providers/${id}`).then((r) => r.data),
    defaultPrompt: () =>
      api
        .get<{ system_prompt: string }>(`/me/ai/prompt-default`)
        .then((r) => r.data),
  },

};
