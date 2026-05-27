/**
 * Reporting API client.
 *
 * Covers: exports (start/list/detail/download/retry/cancel/delete),
 * scheduled exports (CRUD + run-now), Google Sheets link + sync,
 * dashboards (course / tenant / global / student),
 * recent activity feeds, read-model rebuild.
 */
import api from '../client';
import type { Operation, Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// -------------------- Types --------------------

export type ExportKind =
  | 'assignment_grades'
  | 'course_summary'
  | 'plagiarism_report'
  | 'ai_analysis_summary'
  | 'audit_log'
  | 'tenant_usage';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'pdf' | 'google_sheets';

export type ExportStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ScheduledTarget = 'file_download' | 'google_sheets';

export interface ExportJob {
  id: string;
  tenant_id?: string;
  kind: ExportKind;
  scope: Record<string, unknown>;
  format: ExportFormat;
  status: ExportStatus;
  options?: Record<string, unknown>;
  artifact_uri?: string | null;
  artifact_size_bytes?: number | null;
  artifact_format?: string | null;
  artifact_filename?: string | null;
  expiry_at?: string | null;
  triggered_by?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error?: { title: string; detail?: string } | null;
  created_at: string;
}

export interface ExportListFilter extends ListParams {
  kind?: ExportKind;
  status?: ExportStatus;
  course_id?: string;
}

export interface CreateExportInput {
  kind: ExportKind;
  format: ExportFormat;
  scope?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ScheduledExport {
  id: string;
  course_id: string;
  kind: ExportKind;
  format: ExportFormat;
  target: ScheduledTarget;
  cron: string;
  scope?: Record<string, unknown>;
  enabled: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_by?: string;
  created_at: string;
}

export interface CreateScheduledExportInput {
  kind: ExportKind;
  format: ExportFormat;
  target: ScheduledTarget;
  cron: string;
  scope?: Record<string, unknown>;
  enabled?: boolean;
}

export interface GoogleSheetsLink {
  course_id: string;
  spreadsheet_id: string;
  sheet_name?: string;
  columns_mapping?: Record<string, string>;
  last_sync_at?: string | null;
  last_sync_status?: 'success' | 'failed' | null;
  last_sync_error?: string | null;
}

/** One cell in a previewed worksheet. ``v`` is the value as Google
 *  reports it (string / number / bool); ``note`` is the corner-triangle
 *  cell note when present. */
export interface PreviewCell {
  v: string | number | boolean | null;
  note?: string;
}

/** One worksheet (tab) in a previewed spreadsheet. ``rows`` is a 2D
 *  array of cells, capped by the backend at ``max_rows × max_cols`` so
 *  huge sheets don't blow the payload. ``row_count / col_count`` are the
 *  full sheet dimensions per Google's metadata. */
export interface PreviewWorksheet {
  sheet_id: number;
  title: string;
  row_count: number;
  col_count: number;
  rows: PreviewCell[][];
}

/** Compact JSON rendering of a Google spreadsheet for the interactive
 *  picker. Source: ``GET /api/v1/sheets/{id}/preview``. */
export interface PreviewSpreadsheet {
  spreadsheet_id: string;
  title: string;
  worksheets: PreviewWorksheet[];
}

export interface DashboardKPI {
  enrolled_students: number;
  assignments_count: number;
  submissions_total: number;
  average_score: number | null;
  plagiarism_alerts_count: number;
  ai_runs_count: number;
  ai_tokens_used?: number;
  last_activity_at?: string | null;
}

// Backend returns the KPI flatly (`{course_id, enrolled_students,
// submissions_total, ...}`) — not nested under a `kpi` key. The old
// shape with `kpi: DashboardKPI` made every value render as `undefined`
// on the frontend; we mirror reality now. `cached` is set by the
// caching wrapper in the reporting service.
export interface CourseDashboard extends DashboardKPI {
  course_id: string;
  cached?: boolean;
  generated_at?: string;
}

export interface GradesDistributionBucket {
  bucket: string;
  min: number;
  max: number;
  count: number;
}

export interface GradesDistribution {
  buckets: GradesDistributionBucket[];
  mean: number | null;
  median: number | null;
  stddev: number | null;
}

export interface AssignmentAverage {
  assignment_id: string;
  assignment_title: string;
  average_score: number | null;
  median_score: number | null;
  submissions_count: number;
}

export interface PlagiarismStatsPoint {
  date: string;
  pairs_suspected: number;
  max_similarity: number;
}

export interface PlagiarismStats {
  series: PlagiarismStatsPoint[];
  by_language: { language: string; count: number }[];
  total_runs: number;
  total_pairs_flagged: number;
}

export interface AIUsagePoint {
  date: string;
  tokens: number;
  cost_usd: number;
  runs: number;
}

export interface AIUsageStats {
  series: AIUsagePoint[];
  total_tokens: number;
  total_cost_usd: number;
  cache_hit_rate: number;
  runs_count: number;
}

export interface TimelinePoint {
  week: string;
  submissions: number;
  graded: number;
}

export interface ActiveStudent {
  user_id: string;
  display_name: string;
  email?: string;
  submissions_count: number;
  last_active_at: string;
}

export interface Straggler {
  user_id: string;
  display_name: string;
  email?: string;
  submissions_count: number;
  average_score: number | null;
  missed_count: number;
}

export interface LateSubmission {
  submission_id: string;
  assignment_id: string;
  assignment_title: string;
  user_id: string;
  display_name: string;
  submitted_at: string;
  late_kind: 'soft' | 'hard';
  delay_minutes: number;
}

export interface LanguageBreakdownItem {
  language: string;
  count: number;
  percent: number;
}

export interface TenantDashboard {
  tenant_id: string;
  active_courses: number;
  active_users_dau: number;
  active_users_mau: number;
  submissions_30d: number;
  ai_tokens_total_30d: number;
  ai_cost_total_30d: number;
  plagiarism_runs_30d: number;
  storage_used_bytes: number;
  generated_at: string;
}

export interface IntegrationsHealthItem {
  integration: string;
  status: 'healthy' | 'degraded' | 'down';
  last_check_at: string;
  error?: string | null;
}

export interface GlobalDashboard {
  tenants_count: number;
  active_users_total: number;
  submissions_total_30d: number;
  ai_cost_total_30d: number;
  plagiarism_runs_total_30d: number;
  generated_at: string;
}

export interface MyDashboard {
  upcoming_deadlines: {
    assignment_id: string;
    assignment_title: string;
    course_slug: string;
    course_name: string;
    due_at: string;
  }[];
  recent_grades: {
    submission_id: string;
    assignment_id: string;
    assignment_title: string;
    course_slug: string;
    score: number;
    graded_at: string;
  }[];
  my_courses: {
    id: string;
    slug: string;
    name: string;
    role: string;
    average_score: number | null;
  }[];
  generated_at: string;
}

export interface ActivityEvent {
  id: string;
  event_type: string;
  occurred_at: string;
  actor?: { id: string; display_name: string };
  summary: string;
  link?: string | null;
}

const idem = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

// -------------------- API client --------------------

export const reportingApi = {
  // ---- A/B. Exports ----
  listExports: (params: ExportListFilter = {}) => {
    const query = {
      ...buildListParams(params),
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.course_id ? { course_id: params.course_id } : {}),
    };
    return api
      .get<Paginated<ExportJob>>('/exports', { params: query })
      .then((r) => r.data);
  },

  listCourseExports: (courseId: string, params: ListParams = {}) =>
    api
      .get<Paginated<ExportJob>>(`/courses/${courseId}/exports`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  getExport: (id: string) =>
    api.get<ExportJob>(`/exports/${id}`).then((r) => r.data),

  downloadExport: (id: string) =>
    api
      .get<{ url: string; expires_in: number }>(`/exports/${id}/download`)
      .then((r) => r.data),

  startGenericExport: (input: CreateExportInput) =>
    api
      .post<Operation>(
        '/exports',
        input,
        { headers: { 'Idempotency-Key': idem() } },
      )
      .then((r) => r.data),

  startCourseExport: (courseId: string, input: CreateExportInput) =>
    api
      .post<Operation>(`/courses/${courseId}/exports`, input, {
        headers: { 'Idempotency-Key': idem() },
      })
      .then((r) => r.data),

  startAssignmentExport: (assignmentId: string, input: CreateExportInput) =>
    api
      .post<Operation>(
        `/assignments/${assignmentId}/exports`,
        input,
        { headers: { 'Idempotency-Key': idem() } },
      )
      .then((r) => r.data),

  retryExport: (id: string) =>
    api.post<Operation>(`/exports/${id}:retry`).then((r) => r.data),

  cancelExport: (id: string) =>
    api.post<void>(`/exports/${id}:cancel`).then((r) => r.data),

  deleteExport: (id: string) =>
    api.delete<void>(`/exports/${id}`).then((r) => r.data),

  // ---- C. Google Sheets (per-course link — integration service, via
  //         the gateway route /courses/{id}/google-sheets). GET 404 ==
  //         "не привязано" → null. Save is create-or-update: POST to
  //         create, PATCH to change an existing link. ----
  getSheetsLink: (courseId: string) =>
    api
      .get<GoogleSheetsLink>(`/courses/${courseId}/google-sheets/link`)
      .then((r) => r.data)
      .catch((e) => {
        if (
          (e as { response?: { status?: number } })?.response?.status === 404
        )
          return null;
        throw e;
      }),

  createSheetsLink: (
    courseId: string,
    body: {
      spreadsheet_id: string;
      sheet_name: string;
      columns_mapping?: Record<string, string>;
    },
  ) =>
    api
      .post<GoogleSheetsLink>(`/courses/${courseId}/google-sheets/link`, body)
      .then((r) => r.data),

  setSheetsLink: (
    courseId: string,
    body: {
      spreadsheet_id?: string;
      sheet_name?: string;
      columns_mapping?: Record<string, string>;
    },
  ) =>
    api
      .patch<GoogleSheetsLink>(`/courses/${courseId}/google-sheets/link`, body)
      .then((r) => r.data),

  deleteSheetsLink: (courseId: string) =>
    api
      .delete<void>(`/courses/${courseId}/google-sheets/link`)
      .then((r) => r.data),

  /** Server-side access check: does the configured service account /
   *  teacher token actually have edit access to the linked spreadsheet? */
  validateSheetsLink: (courseId: string) =>
    api
      .post<{
        ok: boolean;
        detail?: string | null;
        metadata?: Record<string, unknown> | null;
      }>(`/courses/${courseId}/google-sheets/link:validate`)
      .then((r) => r.data),

  syncSheets: (courseId: string) =>
    api
      .post<Operation>(
        `/courses/${courseId}/exports/google-sheets/sync`,
        {},
        { headers: { 'Idempotency-Key': idem() } },
      )
      .then((r) => r.data),

  lastSync: (courseId: string) =>
    api
      .get<{ last_sync_at: string | null; status: string | null }>(
        `/courses/${courseId}/exports/google-sheets/last-sync`,
      )
      .then((r) => r.data),

  /** Fetch a Google spreadsheet's contents (all tabs + cells + notes)
   *  for the interactive export picker. The service account must have
   *  read access to the spreadsheet — share it with the SA email first. */
  previewSpreadsheet: (
    spreadsheetId: string,
    opts?: { max_rows?: number; max_cols?: number },
  ) =>
    api
      .get<PreviewSpreadsheet>(
        `/sheets/${encodeURIComponent(spreadsheetId)}/preview`,
        { params: opts },
      )
      .then((r) => r.data),

  /** Dry-run the assignment_grades builder and return the resulting
   *  matrix (same shape the real export would write). The frontend
   *  paints it into the Univer preview at the chosen anchor cell so
   *  the teacher can eyeball the values before hitting «Записать в
   *  таблицу» (which is the actual write). */
  previewGrades: (body: {
    course_id: string;
    homework_ids: string[];
    options?: Record<string, unknown>;
  }) =>
    api
      .post<{
        title?: string;
        columns: string[];
        rows: Array<Record<string, string | number | null>>;
        cell_notes: Array<{ row: number; column: string; note: string }>;
        metadata?: Record<string, unknown>;
      }>(`/exports/preview-grades`, body)
      .then((r) => r.data),

  // ---- D. Scheduled Exports ----
  listScheduled: (courseId: string) =>
    api
      .get<ScheduledExport[]>(`/courses/${courseId}/scheduled-exports`)
      .then((r) => r.data),

  createScheduled: (
    courseId: string,
    body: CreateScheduledExportInput,
  ) =>
    api
      .post<ScheduledExport>(
        `/courses/${courseId}/scheduled-exports`,
        body,
      )
      .then((r) => r.data),

  updateScheduled: (
    courseId: string,
    scheduleId: string,
    body: Partial<CreateScheduledExportInput>,
  ) =>
    api
      .patch<ScheduledExport>(
        `/courses/${courseId}/scheduled-exports/${scheduleId}`,
        body,
      )
      .then((r) => r.data),

  deleteScheduled: (courseId: string, scheduleId: string) =>
    api
      .delete<void>(
        `/courses/${courseId}/scheduled-exports/${scheduleId}`,
      )
      .then((r) => r.data),

  runScheduledNow: (courseId: string, scheduleId: string) =>
    api
      .post<Operation>(
        `/courses/${courseId}/scheduled-exports/${scheduleId}:run-now`,
        {},
        { headers: { 'Idempotency-Key': idem() } },
      )
      .then((r) => r.data),

  // ---- E. Course dashboard ----
  courseDashboard: (courseId: string) =>
    api
      .get<CourseDashboard>(`/courses/${courseId}/dashboard`)
      .then((r) => r.data),

  gradesDistribution: (courseId: string) =>
    api
      .get<GradesDistribution>(
        `/courses/${courseId}/dashboard/grades-distribution`,
      )
      .then((r) => r.data),

  gradesByAssignment: (courseId: string) =>
    api
      .get<AssignmentAverage[]>(
        `/courses/${courseId}/dashboard/grades-by-assignment`,
      )
      .then((r) => r.data),

  plagiarismStats: (courseId: string) =>
    api
      .get<PlagiarismStats>(
        `/courses/${courseId}/dashboard/plagiarism-stats`,
      )
      .then((r) => r.data),

  aiUsage: (courseId: string) =>
    api
      .get<AIUsageStats>(`/courses/${courseId}/dashboard/ai-usage`)
      .then((r) => r.data),

  timeline: (courseId: string) =>
    api
      .get<TimelinePoint[]>(`/courses/${courseId}/dashboard/timeline`)
      .then((r) => r.data),

  activeStudents: (courseId: string) =>
    api
      .get<ActiveStudent[]>(
        `/courses/${courseId}/dashboard/active-students`,
      )
      .then((r) => r.data),

  stragglers: (courseId: string) =>
    api
      .get<Straggler[]>(`/courses/${courseId}/dashboard/stragglers`)
      .then((r) => r.data),

  lateSubmissions: (courseId: string) =>
    api
      .get<LateSubmission[]>(
        `/courses/${courseId}/dashboard/late-submissions`,
      )
      .then((r) => r.data),

  languageBreakdown: (courseId: string) =>
    api
      .get<LanguageBreakdownItem[]>(
        `/courses/${courseId}/dashboard/language-breakdown`,
      )
      .then((r) => r.data),

  recentActivity: (courseId: string) =>
    api
      .get<ActivityEvent[]>(`/courses/${courseId}/recent-activity`)
      .then((r) => r.data),

  // ---- F. Tenant dashboard ----
  tenantDashboard: (tenantId: string) =>
    api
      .get<TenantDashboard>(`/tenants/${tenantId}/dashboard`)
      .then((r) => r.data),

  tenantIntegrationsHealth: (tenantId: string) =>
    api
      .get<IntegrationsHealthItem[]>(
        `/tenants/${tenantId}/dashboard/integrations-health`,
      )
      .then((r) => r.data),

  // ---- G. Global ----
  globalDashboard: () =>
    api.get<GlobalDashboard>('/admin/dashboard/global').then((r) => r.data),

  // ---- H. Self ----
  myDashboard: () =>
    api.get<MyDashboard>('/users/me/dashboard').then((r) => r.data),

  myRecentActivity: () =>
    api
      .get<ActivityEvent[]>('/users/me/recent-activity')
      .then((r) => r.data),

  myProgress: () =>
    api
      .get<{ semester: string; progress_percent: number }>(
        '/users/me/progress',
      )
      .then((r) => r.data),

  // ---- Compatibility (older callers) ----
  startExport: (
    kind: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) =>
    api
      .post<{ operation_id: string; status_url: string }>(
        '/exports',
        { kind, ...payload },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .then((r) => r.data),
};
