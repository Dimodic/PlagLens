/**
 */
import api from '../client';
import type { Operation, Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

export type IntegrationKind =
  | 'stepik'
  | 'yandex_contest'
  | 'ejudge'
  | 'manual'
  | 'telegram'
  | 'google_sheets';

export type IntegrationStatus = 'pending_auth' | 'active' | 'disabled' | 'error';

export interface IntegrationConfig {
  id: string;
  tenant_id: string;
  course_id: string | null;
  kind: IntegrationKind;
  display_name: string;
  status: IntegrationStatus;
  settings: Record<string, unknown>;
  cursor: Record<string, unknown> | null;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'failed' | 'partial' | null;
  last_sync_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  oauth_authorize_url?: string | null;
}

export interface IntegrationListFilters extends ListParams {
  kind?: IntegrationKind;
  status?: IntegrationStatus;
  course_id?: string;
  tenant_id?: string;
}

export interface ConnectionStatus {
  ok: boolean;
  // Backend `TestConnectionResult` (services/integration → configs.py) returns
  // `detail` and `metadata`. Keep the legacy `message`/`details` aliases so old
  // call-sites don't break, but prefer the canonical names.
  detail?: string;
  metadata?: Record<string, unknown>;
  message?: string;
  details?: Record<string, unknown>;
  latency_ms?: number;
}

export interface ImportJob {
  id: string;
  integration_id: string;
  scope: Record<string, unknown>;
  trigger: 'manual' | 'scheduled' | 'webhook';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: { completed: number; total: number; percent: number } | null;
  started_at: string | null;
  finished_at: string | null;
  stats: { imported: number; skipped: number; failed: number } | null;
  error: { title: string; detail?: string } | null;
}

export interface SyncSchedule {
  id: string;
  integration_id: string;
  cron: string;
  scope: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  integration_id: string | null;
  kind: 'stepik' | 'yandex_contest' | 'telegram' | 'plagiarism' | 'llm';
  payload_hash: string;
  signature_valid: boolean;
  received_at: string;
  processed_at: string | null;
  status: 'received' | 'processed' | 'ignored' | 'failed';
  raw_payload_uri: string | null;
}

export interface CreateIntegrationInput {
  kind: IntegrationKind;
  course_id?: string | null;
  display_name: string;
  settings: Record<string, unknown>;
}

export interface UpdateIntegrationInput {
  display_name?: string;
  settings?: Record<string, unknown>;
}

export interface SyncInput {
  scope?: { course_id?: string; assignment_id?: string; since?: string };
  force_full?: boolean;
}

export interface CreateScheduleInput {
  cron: string;
  scope?: Record<string, unknown>;
  enabled?: boolean;
}

export interface TelegramBotSettings {
  bot_username: string;
  webhook_url: string;
  has_token: boolean;
  is_active: boolean;
}

export interface IntegrationsHealth {
  data: Array<{
    id: string;
    display_name: string;
    kind: IntegrationKind;
    status: IntegrationStatus;
    last_sync_at: string | null;
    last_sync_status: 'success' | 'failed' | 'partial' | null;
  }>;
}

export const integrationsApi = {
  list: (params: IntegrationListFilters = {}) => {
    const base = buildListParams(params);
    if (params.kind) base.kind = params.kind;
    if (params.status) base.status = params.status;
    if (params.course_id) base.course_id = params.course_id;
    if (params.tenant_id) base.tenant_id = params.tenant_id;
    return api
      .get<Paginated<IntegrationConfig>>('/integrations', { params: base })
      .then((r) => r.data);
  },

  get: (id: string) =>
    api.get<IntegrationConfig>(`/integrations/${id}`).then((r) => r.data),

  create: (input: CreateIntegrationInput) =>
    api
      .post<{ config: IntegrationConfig; oauth_authorize_url?: string | null }>(
        '/integrations',
        input,
      )
      .then((r) => r.data),

  update: (id: string, input: UpdateIntegrationInput) =>
    api.patch<IntegrationConfig>(`/integrations/${id}`, input).then((r) => r.data),

  delete: (id: string) =>
    api.delete<void>(`/integrations/${id}`).then((r) => r.data),

  test: (id: string) =>
    api
      .post<ConnectionStatus>(`/integrations/${id}:test`)
      .then((r) => r.data),

  enable: (id: string) =>
    api.post<IntegrationConfig>(`/integrations/${id}:enable`).then((r) => r.data),

  disable: (id: string) =>
    api.post<IntegrationConfig>(`/integrations/${id}:disable`).then((r) => r.data),

  // -------- OAuth --------
  oauthStart: (id: string) =>
    api
      .get<{ authorize_url: string; state: string }>(
        `/integrations/${id}/oauth/start`,
      )
      .then((r) => r.data),

  oauthRefresh: (id: string) =>
    api.post<IntegrationConfig>(`/integrations/${id}/oauth/refresh`).then((r) => r.data),

  oauthDisconnect: (id: string) =>
    api.delete<IntegrationConfig>(`/integrations/${id}/oauth/disconnect`).then((r) => r.data),

  // Generic OAuth callback finalize — frontend POSTs `code+state` after the
  // provider redirects back to /integrations/oauth/callback.
  oauthFinalize: (params: { code: string; state: string }) =>
    api
      .get<{ status: string; config_id: string; kind: string; active: boolean }>(
        '/integrations/oauth/finalize',
        { params },
      )
      .then((r) => r.data),

  // -------- Yandex.Contest specifics --------
  ycListContests: (configId: string) =>
    api
      .get<{ data: Array<{ external_id: string; title: string; description?: string }> }>(
        `/integrations/yandex-contest/${configId}/contests`,
      )
      .then((r) => r.data),

  // -------- Admin: global OAuth app credentials --------
  listOAuthProviders: () =>
    api
      .get<{
        data: Array<{
          provider_kind: string;
          title: string;
          register_url: string | null;
          default_scope: string | null;
          default_redirect_uri: string | null;
          configured: boolean;
          client_id: string | null;
          client_secret_set: boolean;
          redirect_uri: string | null;
          scope: string | null;
          updated_at: string | null;
        }>;
      }>('/admin/integrations/oauth-providers')
      .then((r) => r.data),

  upsertOAuthProvider: (
    kind: string,
    payload: {
      client_id: string;
      client_secret: string;
      redirect_uri: string;
      scope?: string;
    },
  ) =>
    api
      .put<{ provider_kind: string; configured: boolean }>(
        `/admin/integrations/oauth-providers/${kind}`,
        payload,
      )
      .then((r) => r.data),

  deleteOAuthProvider: (kind: string) =>
    api
      .delete<void>(`/admin/integrations/oauth-providers/${kind}`)
      .then((r) => r.data),

  ycImportParticipants: (
    configId: string,
    contestId: number | string,
    opts: { course_id?: string; homework_id?: string } = {},
  ) =>
    api
      .post<{
        data: unknown[];
        imported: number;
        failed: number;
        errors: string[];
        course_id: string | null;
        identity?: { created: number; existing: number };
        course?: { added: number; existing: number; failed: number; error?: string };
        contest_name?: string | null;
      }>(
        `/integrations/yandex-contest/${configId}/contests/${contestId}/import-participants`,
        null,
        {
          params: {
            ...(opts.course_id ? { course_id: opts.course_id } : {}),
            ...(opts.homework_id ? { homework_id: opts.homework_id } : {}),
          },
        },
      )
      .then((r) => r.data),

  /** Preview the problem list of a contest without writing anything. */
  ycListProblems: (configId: string, contestId: number | string) =>
    api
      .get<{
        data: Array<{
          external_id: string;
          alias: string | null;
          title: string;
          position: number | null;
          statement_html: string | null;
          time_limit_ms: number | null;
          memory_limit_bytes: number | null;
          language_hint: string | null;
        }>;
        imported: number;
        failed: number;
        errors: string[];
      }>(
        `/integrations/yandex-contest/${configId}/contests/${contestId}/problems`,
      )
      .then((r) => r.data),

  /** Kick off an async one-shot import. Returns immediately with an
   * ``operation_id`` — poll ``ycGetImportOperation(id)`` for live
   * progress. Pass ``course_id`` when the integration is tenant-wide
   * (i.e. not bound to a specific course). */
  ycImportAsHomework: (
    configId: string,
    contestId: number | string,
    course_id?: string,
  ) =>
    api
      .post<{ operation_id: string; status_url: string }>(
        `/integrations/yandex-contest/${configId}/contests/${contestId}/import-as-homework`,
        undefined,
        course_id ? { params: { course_id } } : undefined,
      )
      .then((r) => r.data),

  /** Poll endpoint for the async import operation. Returns the current
   * stage + counters; ``status`` cycles ``running → completed | failed``.
   * Returns ``{ status: 'expired' }`` for unknown / expired ids. */
  ycGetImportOperation: (opId: string) =>
    api
      .get<{
        status: 'running' | 'completed' | 'failed' | 'expired';
        stage:
          | 'starting'
          | 'fetching_contest'
          | 'creating_homework'
          | 'creating_assignments'
          | 'fetching_submissions'
          | 'importing_submissions'
          | 'done'
          | null;
        contest_id?: number;
        course_id?: string;
        homework_id?: string | null;
        homework_slug?: string | null;
        homework_title?: string | null;
        problems_total?: number;
        problems_done?: number;
        submissions_fetched?: number;
        submissions_imported?: number;
        submissions_pages?: number;
        errors?: string[];
        /** True when this op is a re-import of an already-imported
         *  contest — it only re-syncs submissions into the existing
         *  homework rather than creating a new one. */
        resync?: boolean;
      }>(`/integrations/yandex-contest/import-operations/${opId}`)
      .then((r) => r.data),

  /** Pull problems and create one PlagLens assignment per problem under the
   * given homework. Returns counts + per-item errors. */
  ycImportProblems: (
    configId: string,
    contestId: number | string,
    homeworkId: number | string,
  ) =>
    api
      .post<{
        fetched: number;
        created: number;
        failed: number;
        errors: string[];
        homework_id: string;
      }>(
        `/integrations/yandex-contest/${configId}/contests/${contestId}/import-problems`,
        undefined,
        { params: { homework_id: homeworkId } },
      )
      .then((r) => r.data),

  ycImportSubmissions: (configId: string, contestId: number | string) =>
    api
      .post<{
        fetched: number;
        failed: number;
        errors: string[];
        cursor: Record<string, unknown>;
        note: string;
      }>(
        `/integrations/yandex-contest/${configId}/contests/${contestId}/import-submissions`,
      )
      .then((r) => r.data),

  // -------- Sync --------
  syncNow: (id: string, input: SyncInput = {}) =>
    api.post<Operation>(`/integrations/${id}/sync`, input).then((r) => r.data),

  listImportJobs: (id: string, params: ListParams = {}) =>
    api
      .get<Paginated<ImportJob>>(`/integrations/${id}/import-jobs`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  cancelImportJob: (id: string, job_id: string) =>
    api.post<ImportJob>(`/integrations/${id}/import-jobs/${job_id}:cancel`).then((r) => r.data),

  retryImportJob: (id: string, job_id: string) =>
    api.post<ImportJob>(`/integrations/${id}/import-jobs/${job_id}:retry`).then((r) => r.data),

  // -------- Schedules --------
  listSchedules: (id: string) =>
    api
      .get<{ data: SyncSchedule[] }>(`/integrations/${id}/schedules`)
      .then((r) => r.data.data),

  createSchedule: (id: string, input: CreateScheduleInput) =>
    api
      .post<SyncSchedule>(`/integrations/${id}/schedules`, input)
      .then((r) => r.data),

  deleteSchedule: (id: string, schedule_id: string) =>
    api
      .delete<void>(`/integrations/${id}/schedules/${schedule_id}`)
      .then((r) => r.data),

  runScheduleNow: (id: string, schedule_id: string) =>
    api
      .post<Operation>(`/integrations/${id}/schedules/${schedule_id}:run-now`)
      .then((r) => r.data),

  // -------- Google Sheets (tenant-level SA setup) --------
  /** Admin pastes a Service Account JSON; stored as an IntegrationConfig
   *  of kind ``google_sheets``. Reporting-service fetches it on demand
   *  for the export page's grades-to-sheet flow. */
  googleSheetsSetup: (body: { display_name?: string; sa_json: string }) =>
    api
      .post<{
        id: string;
        kind: string;
        status: string;
        display_name: string;
        client_email: string | null;
      }>('/integrations/google-sheets/setup', body)
      .then((r) => r.data),

  /** Iter 3: a teacher uploads their OWN Service Account JSON — used
   *  only for their exports, doesn't touch the tenant-wide SA. */
  googleSheetsPersonalSetup: (body: {
    display_name?: string;
    sa_json: string;
  }) =>
    api
      .post<{
        id: string;
        kind: string;
        status: string;
        display_name: string;
        client_email: string | null;
        auth_mode: string;
      }>('/integrations/google-sheets/personal-setup', body)
      .then((r) => r.data),

  // -------- Webhook events --------
  listWebhookEvents: (params: ListParams & { kind?: WebhookEvent['kind'] } = {}) => {
    const base = buildListParams(params);
    if (params.kind) base.kind = params.kind;
    return api
      .get<Paginated<WebhookEvent>>('/admin/integrations/webhook-events', {
        params: base,
      })
      .then((r) => r.data);
  },

  // -------- Telegram --------
  getTelegramBotSettings: () =>
    api
      .get<TelegramBotSettings>('/admin/integrations/telegram/bot-settings')
      .then((r) => r.data),

  updateTelegramBotSettings: (body: Partial<TelegramBotSettings>) =>
    api
      .patch<TelegramBotSettings>('/admin/integrations/telegram/bot-settings', body)
      .then((r) => r.data),

  // -------- Health --------
  health: () =>
    api
      .get<IntegrationsHealth>('/admin/integrations/health')
      .then((r) => r.data),

  dlq: (params: ListParams = {}) =>
    api
      .get<Paginated<ImportJob>>('/admin/integrations/dlq', {
        params: buildListParams(params),
      })
      .then((r) => r.data),
};
