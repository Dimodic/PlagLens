/**
 * AI Analysis Service API client.
 *
 * See docs/architecture/legacy/09-AI-ANALYSIS.md.
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

export interface PromptVersion {
  id: string;
  name: string;
  system_prompt: string;
  user_template: string;
  json_schema: Record<string, unknown>;
  active_for_tenant: boolean;
  created_at: string;
  deactivated_at: string | null;
}

export interface ProviderConfig {
  id: string;
  tenant_id: string;
  provider: string; // e.g. 'openai', 'yandex', 'gigachat', 'self_hosted', 'openrouter'
  base_url: string;
  model: string;
  api_key_env_var: string;
  enabled: boolean;
  default_for_tenant: boolean;
  priority: number;
  rate_limit_rpm: number;
  max_tokens?: number | null;
  settings?: Record<string, unknown>;
  created_at: string;
}

export interface BudgetConfig {
  scope: 'tenant' | 'course';
  scope_id: string;
  period: 'day' | 'week' | 'month';
  max_tokens: number | null;
  max_cost: number | null;
  soft_warn_at: number;
  hard_stop_at: number;
  reset_at: string;
}

export interface BudgetUsage {
  scope: 'tenant' | 'course';
  scope_id: string;
  period: 'day' | 'week' | 'month';
  period_start: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  analyses_count: number;
  cache_hits: number;
}

export interface UsageHistoryPoint {
  period_start: string;
  total_tokens: number;
  total_cost: number;
  analyses_count: number;
}

export interface CacheStats {
  total_entries: number;
  size_bytes: number;
  hit_rate: number;
  by_prompt_version: Record<string, number>;
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

export interface TestProviderResult {
  ok: boolean;
  /** Round-trip latency in milliseconds. Absent if the request never left
   * the gateway (e.g. missing API key). */
  latency_ms?: number;
  model_response?: string;
  error?: string;
}

export interface TestPromptResult {
  report: PlagLensReport | null;
  raw_response: string;
  tokens_used: number;
  cost_estimate: number;
  latency_ms: number;
}

// ---------- API ----------

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

  // E. Prompt versions (admin)
  listPromptVersions: (params: ListParams = {}) =>
    api
      .get<Paginated<PromptVersion>>(`/admin/ai/prompt-versions`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  getPromptVersion: (id: string) =>
    api.get<PromptVersion>(`/admin/ai/prompt-versions/${id}`).then((r) => r.data),

  createPromptVersion: (
    body: Omit<PromptVersion, 'active_for_tenant' | 'created_at' | 'deactivated_at'>,
  ) =>
    api.post<PromptVersion>(`/admin/ai/prompt-versions`, body).then((r) => r.data),

  updatePromptVersion: (id: string, body: Partial<PromptVersion>) =>
    api.patch<PromptVersion>(`/admin/ai/prompt-versions/${id}`, body).then((r) => r.data),

  activatePromptVersion: (id: string) =>
    api.post<PromptVersion>(`/admin/ai/prompt-versions/${id}:activate`).then((r) => r.data),

  testPromptVersion: (id: string, body: { code: string; language: string }) =>
    api
      .post<TestPromptResult>(`/admin/ai/prompt-versions/${id}:test`, body)
      .then((r) => r.data),

  // F. Provider configs
  listProviders: () =>
    api
      .get<{ data: ProviderConfig[] } | ProviderConfig[]>(`/admin/ai/providers`)
      .then((r) => {
        // Backend may return either {data: [...]} or bare [...] shape; tolerate both.
        const d = r.data as { data?: ProviderConfig[] } | ProviderConfig[];
        if (Array.isArray(d)) return d;
        return d?.data ?? [];
      }),

  getProvider: (id: string) =>
    api.get<ProviderConfig>(`/admin/ai/providers/${id}`).then((r) => r.data),

  createProvider: (
    body: Omit<ProviderConfig, 'id' | 'created_at' | 'tenant_id'> & {
      /** Plain API key — backend stores it as ``api_key_secret_ref``. Not
       * returned on GET. Either this or ``api_key_env_var`` should be set. */
      api_key?: string | null;
    },
  ) =>
    api.post<ProviderConfig>(`/admin/ai/providers`, body).then((r) => r.data),

  updateProvider: (
    id: string,
    body: Partial<ProviderConfig> & { api_key?: string | null },
  ) =>
    api.patch<ProviderConfig>(`/admin/ai/providers/${id}`, body).then((r) => r.data),

  deleteProvider: (id: string) =>
    api.delete(`/admin/ai/providers/${id}`).then((r) => r.data),

  testProvider: (id: string) =>
    api.post<TestProviderResult>(`/admin/ai/providers/${id}:test`).then((r) => r.data),

  setProviderDefault: (id: string) =>
    api.post<ProviderConfig>(`/admin/ai/providers/${id}:set-default`).then((r) => r.data),

  // G. Budgets
  getTenantBudget: (tenantId: string) =>
    api.get<BudgetConfig>(`/tenants/${tenantId}/ai/budget`).then((r) => r.data),

  updateTenantBudget: (tenantId: string, body: Partial<BudgetConfig>) =>
    api.patch<BudgetConfig>(`/tenants/${tenantId}/ai/budget`, body).then((r) => r.data),

  getCourseBudget: (courseId: string) =>
    api.get<BudgetConfig>(`/courses/${courseId}/ai/budget`).then((r) => r.data),

  updateCourseBudget: (courseId: string, body: Partial<BudgetConfig>) =>
    api.patch<BudgetConfig>(`/courses/${courseId}/ai/budget`, body).then((r) => r.data),

  getTenantUsage: (tenantId: string) =>
    api
      .get<{ current: BudgetUsage; history: UsageHistoryPoint[] }>(
        `/tenants/${tenantId}/ai/usage`,
      )
      .then((r) => r.data),

  getCourseUsage: (courseId: string) =>
    api
      .get<{ current: BudgetUsage; history: UsageHistoryPoint[] }>(
        `/courses/${courseId}/ai/usage`,
      )
      .then((r) => r.data),

  // H. Cache
  getCacheStats: () =>
    api.get<CacheStats>(`/admin/ai/cache/stats`).then((r) => r.data),

  purgeCacheAll: () => api.delete(`/admin/ai/cache`).then((r) => r.data),

  purgeCacheByPromptVersion: (id: string) =>
    api.delete(`/admin/ai/cache/by-prompt-version/${id}`).then((r) => r.data),

  purgeCacheBySubmission: (submissionId: string) =>
    api.delete(`/admin/ai/cache/by-submission/${submissionId}`).then((r) => r.data),
};
