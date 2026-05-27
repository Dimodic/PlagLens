/**
 * Submission Service endpoints.
 */
import api from '../client';
import type { Operation, Paginated, UserSummary } from '../types';
import { buildListParams, type ListParams } from '../pagination';

function normalisePaginated<T>(body: Paginated<T> | T[] | undefined | null): Paginated<T> {
  if (Array.isArray(body)) {
    return {
      data: body,
      pagination: { has_more: false, limit: body.length, next_cursor: null },
    } as Paginated<T>;
  }
  return body ?? ({ data: [], pagination: { has_more: false, limit: 0, next_cursor: null } } as Paginated<T>);
}

// -------------------- Domain types --------------------

export type SubmissionStatus = 'received' | 'processing' | 'ready' | 'error';
export type SubmissionSource = 'manual' | 'stepik' | 'yandex_contest' | 'api';
export type LateKind = null | 'soft' | 'hard';

export interface SubmissionFlags {
  suspicious?: boolean;
  llm_attention?: boolean;
  manually_flagged?: boolean;
  [k: string]: boolean | undefined;
}

export interface SubmissionBrief {
  id: string;
  assignment_id: string;
  course_id?: string;
  author_id: string | null;
  author?: UserSummary;
  /** Display label set at import time when the author isn't a PlagLens user
   *  (e.g. Yandex.Contest participants → "Петров Александр Сергеевич" or a
   *  raw login). Use {@link displayAuthor} to pick the right field. */
  author_label?: string | null;
  version: number;
  source: SubmissionSource;
  language: string;
  status: SubmissionStatus;
  flags: SubmissionFlags;
  is_late: boolean;
  late_kind: LateKind;
  total_size_bytes: number;
  submitted_at: string;
  imported_at: string | null;
  external_verdict?: string | null;
  external_score?: number | null;
  selected_for_grading?: boolean;
  /** Final grade — populated on staff triage rows so the list shows the
   *  actual оценка instead of a "проверено" badge. Null when ungraded
   *  (or on the student self-service list, where grade release is gated
   *  server-side). */
  score?: number | null;
  max_score?: number | null;
  /** Assistant this submission was round-robined to by the teacher's
   *  "distribute among assistants" action. ``name`` is denormalised so
   *  list rows can render "→ ФИО" without resolving the id. */
  assigned_grader_id?: string | null;
  assigned_grader_name?: string | null;
  /** Denormalised titles from the staff-inbox endpoint so a row can
   *  show "Задача · ДЗ · Курс" even in the cross-course view (no
   *  per-course assignment fetch needed). */
  assignment_title?: string | null;
  homework_title?: string | null;
  course_name?: string | null;
  /** True when a grade row with a score exists (staff inbox). */
  is_graded?: boolean;
}

export interface Submission extends SubmissionBrief {
  content_hash: string;
  external_id?: string | null;
  external_url?: string | null;
}

/** Pick the best human label for a submission's author.
 *
 * Resolution order:
 *   1. real PlagLens user → `author.display_name`
 *   2. external participant → `author_label` (set by integrations like YC)
 *   3. raw `author_id` as a last resort (typically `yc:<uid>` or `usr_xxx`)
 *   4. `'—'` if even that's missing
 *
 * Keeping this in one place means every list/table renders the author the
 * same way without each page re-inventing the fallback chain. */
export function displayAuthor(s: SubmissionBrief): string {
  return (
    s.author?.display_name ??
    s.author?.email ??
    s.author_label ??
    s.author_id ??
    '—'
  );
}

/** An imported external participant (e.g. Yandex.Contest) that hasn't yet
 *  been claimed by a real PlagLens account. Their submissions hang off a
 *  "ghost" author (`author_id = yc:<uid>`). Once a participant redeems a
 *  claim code, they drop off this list. */
export interface ExternalParticipant {
  external_id: string;
  display_name: string | null;
  submission_count: number;
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  path: string;
  size_bytes: number;
  mime_type: string;
  content_hash: string;
}

export interface SubmissionGrade {
  submission_id: string;
  score: number;
  max_score: number;
  applied_multiplier: number;
  graded_by: string;
  graded_at: string;
  comment_visible_to_student: boolean;
  comment?: string | null;
  updated_at: string;
}

/** Backend-aggregated assignment stats. Computed in submission_service
 *  via a single DB query (latest-per-student + grade join), exposed at
 *  ``GET /api/v1/assignments/{id}/aggregate-stats``. */
export interface AssignmentAggregateStats {
  submissions_count: number;
  students_submitted: number;
  late_count: number;
  average_score: number | null;
  graded_count: number;
}

/** One assistant in a distribute request — id + display name. The name
 *  is forwarded so the backend can denormalise it onto each submission
 *  for "→ ФИО" display without a per-row lookup. */
export interface GraderRef {
  id: string;
  name: string;
  /** Relative allocation weight. `0` excludes the assistant entirely.
   *  Default `1.0` reproduces equal round-robin; setting one to `2`
   *  doubles their share. Optional for backwards compat — old call
   *  sites that omit it still get the legacy equal split. */
  weight?: number;
}

export interface DistributeSubmissionsInput {
  /** Scope — pass exactly one. */
  course_id?: string;
  assignment_id?: string;
  graders: GraderRef[];
}

export interface DistributeSubmissionsResult {
  assigned: number;
  graders: number;
  /** Latest-per-student rows left untouched because already assigned. */
  skipped: number;
}

export interface GradeHistoryEntry {
  id: string;
  score: number;
  graded_by: string;
  graded_at: string;
  comment?: string | null;
}

export interface SubmissionFeedback {
  id: string;
  submission_id: string;
  author_id: string;
  body: string;
  visible_to_student: boolean;
  source: 'manual' | 'llm_curated';
  created_at: string;
  updated_at: string;
}

export interface SubmissionFlag {
  id: string;
  submission_id: string;
  kind: 'suspicious' | 'llm_attention' | 'manual';
  set_by: string;
  reason: string | null;
  created_at: string;
  cleared_at: string | null;
}

// -------------------- Inputs --------------------

export interface SubmissionListFilters extends ListParams {
  author_id?: string;
  status?: SubmissionStatus;
  late?: boolean;
  suspicious?: boolean;
  language?: string;
  min_score?: number;
  max_score?: number;
  version?: number;
  /** Staff inbox only — narrow to one assistant's distributed pile. */
  assigned_grader_id?: string;
  /** Staff inbox only — narrow to a whole homework's assignments (the
   *  ДЗ filter fans a homework out to its assignment ids). Serialised
   *  as repeated ``assignment_ids=`` query params. */
  assignment_ids?: string[];
  /** Staff inbox only — triage bucket: 'flagged' (manual review flag) |
   *  'pending' (no grade yet) | 'graded' (score set). Server-side so
   *  the total + pagination reflect the filter. */
  review_status?: 'flagged' | 'pending' | 'graded';
  /** Staff inbox only — collapse v1/v2/v3… per (assignment, author)
   *  into a single most-recent row. Without it, the inbox total counts
   *  every version separately and looks 10× larger than reality. */
  latest_per_student?: boolean;
}

export interface CreateGradeInput {
  score: number;
  comment_visible_to_student?: boolean;
  comment?: string;
}

export interface CreateFeedbackInput {
  body: string;
  visible_to_student: boolean;
}

export interface CreateFlagInput {
  kind: 'suspicious' | 'llm_attention' | 'manual';
  reason?: string;
}

// -------------------- API --------------------

function appendFilters(
  base: Record<string, string | number>,
  f: SubmissionListFilters,
): Record<string, string | number> {
  if (f.author_id) base.author_id = f.author_id;
  if (f.status) base.status = f.status;
  if (f.late !== undefined) base.late = String(f.late);
  if (f.suspicious !== undefined) base.suspicious = String(f.suspicious);
  if (f.language) base.language = f.language;
  if (f.min_score !== undefined) base.min_score = f.min_score;
  if (f.max_score !== undefined) base.max_score = f.max_score;
  if (f.version !== undefined) base.version = f.version;
  if (f.assigned_grader_id) base.assigned_grader_id = f.assigned_grader_id;
  if (f.review_status) base.review_status = f.review_status;
  if (f.latest_per_student) base.latest_per_student = 'true';
  return base;
}

export const submissionsApi = {
  listForAssignment: (assignment_id: string, filters: SubmissionListFilters = {}) => {
    const base = appendFilters(buildListParams(filters), filters);
    return api
      .get<Paginated<SubmissionBrief> | SubmissionBrief[]>(
        `/assignments/${assignment_id}/submissions`,
        { params: base },
      )
      .then((r) => normalisePaginated(r.data));
  },

  latestPerStudent: (assignment_id: string, signal?: AbortSignal) =>
    api
      .get<Paginated<SubmissionBrief> | SubmissionBrief[]>(
        `/assignments/${assignment_id}/submissions/latest-per-student`,
        { signal },
      )
      .then((r) => normalisePaginated(r.data)),

  bestPerStudent: (assignment_id: string) =>
    api
      .get<Paginated<SubmissionBrief> | SubmissionBrief[]>(
        `/assignments/${assignment_id}/submissions/best-per-student`,
      )
      .then((r) => normalisePaginated(r.data)),

  myForAssignment: (assignment_id: string) =>
    api
      .get<Paginated<SubmissionBrief> | SubmissionBrief[]>(
        `/users/me/assignments/${assignment_id}/submissions`,
      )
      .then((r) => normalisePaginated(r.data)),

  mySubmissions: (filters: SubmissionListFilters & { course_id?: string } = {}) => {
    const base: Record<string, unknown> = appendFilters(
      buildListParams(filters),
      filters,
    );
    if (filters.course_id) base.course_id = filters.course_id;
    // assignment_ids is an array. ``paramsSerializer: { indexes: null }``
    // makes axios emit repeated keys without brackets
    // (assignment_ids=1&assignment_ids=2) — what FastAPI's
    // ``list[str] = Query()`` expects.
    if (filters.assignment_ids && filters.assignment_ids.length > 0) {
      base.assignment_ids = filters.assignment_ids;
    }
    return api
      .get<Paginated<SubmissionBrief> | SubmissionBrief[]>(
        '/users/me/submissions',
        { params: base, paramsSerializer: { indexes: null } },
      )
      .then((r) => normalisePaginated(r.data));
  },

  // Unclaimed external (Yandex.Contest) participants imported into the
  // course — used by the teacher's "generate claim codes" dialog.
  // Returns a plain array (no pagination envelope).
  externalParticipants: (course_id: string, signal?: AbortSignal) =>
    api
      .get<ExternalParticipant[]>(
        `/courses/${course_id}/submissions/external-participants`,
        { signal },
      )
      .then((r) => r.data ?? []),

  get: (id: string, signal?: AbortSignal) =>
    api.get<Submission>(`/submissions/${id}`, { signal }).then((r) => r.data),

  history: (id: string, signal?: AbortSignal) =>
    api
      .get<Paginated<SubmissionBrief> | SubmissionBrief[]>(
        `/submissions/${id}/history`,
        { signal },
      )
      .then((r) => normalisePaginated(r.data)),

  // ---- files ----
  listFiles: (id: string, signal?: AbortSignal) =>
    api
      .get<Paginated<SubmissionFile> | SubmissionFile[]>(
        `/submissions/${id}/files`,
        { signal },
      )
      .then((r) => normalisePaginated(r.data)),

  getFileMeta: (id: string, file_id: string) =>
    api
      .get<SubmissionFile>(`/submissions/${id}/files/${file_id}`)
      .then((r) => r.data),

  getFileContent: (id: string, file_id: string, signal?: AbortSignal) =>
    api
      .get<string>(`/submissions/${id}/files/${file_id}/content`, {
        responseType: 'text',
        transformResponse: (data) => data, // keep raw text
        signal,
      })
      .then((r) => (typeof r.data === 'string' ? r.data : String(r.data ?? ''))),

  // ---- write ----
  upload: (assignment_id: string, formData: FormData) =>
    api
      .post<Submission | Operation>(
        `/assignments/${assignment_id}/submissions`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      )
      .then((r) => r.data),

  delete: (id: string) => api.delete<void>(`/submissions/${id}`).then((r) => r.data),

  select: (id: string) =>
    api.post<Submission>(`/submissions/${id}:select`).then((r) => r.data),
  unselect: (id: string) =>
    api.post<Submission>(`/submissions/${id}:unselect`).then((r) => r.data),
  rerunChecks: (id: string) =>
    api.post<Operation>(`/submissions/${id}:rerun-checks`).then((r) => r.data),

  // ---- grading ----
  getGrade: (id: string, signal?: AbortSignal) =>
    api
      .get<SubmissionGrade>(`/submissions/${id}/grade`, { signal })
      .then((r) => r.data),

  setGrade: (id: string, input: CreateGradeInput) =>
    api.post<SubmissionGrade>(`/submissions/${id}/grade`, input).then((r) => r.data),

  updateGrade: (id: string, input: Partial<CreateGradeInput>) =>
    api
      .patch<SubmissionGrade>(`/submissions/${id}/grade`, input)
      .then((r) => r.data),

  deleteGrade: (id: string) =>
    api.delete<void>(`/submissions/${id}/grade`).then((r) => r.data),

  gradeHistory: (id: string, signal?: AbortSignal) =>
    api
      .get<Paginated<GradeHistoryEntry> | GradeHistoryEntry[]>(
        `/submissions/${id}/grade/history`,
        { signal },
      )
      .then((r) => normalisePaginated(r.data)),

  // All grades for one assignment — used by the stats tab to compute
  // mean + draw a score histogram client-side without N round-trips.
  listAssignmentGrades: (assignmentId: string, signal?: AbortSignal) =>
    api
      .get<SubmissionGrade[]>(`/assignments/${assignmentId}/grades`, {
        signal,
      })
      .then((r) => r.data),

  // Real backend aggregate stats — counts, average, late count are
  // computed in the database (latest-per-student + grade join), so the
  // frontend can stop fudging numbers client-side. Used by the Stats
  // tab metric strip and by the assignment-level dashboard tiles.
  assignmentAggregateStats: (
    assignmentId: string,
    signal?: AbortSignal,
  ) =>
    api
      .get<AssignmentAggregateStats>(
        `/assignments/${assignmentId}/aggregate-stats`,
        { signal },
      )
      .then((r) => r.data),

  // Round-robin a course's or an assignment's submissions across the
  // given assistants. Scope = exactly one of course_id / assignment_id.
  distribute: (body: DistributeSubmissionsInput) =>
    api
      .post<DistributeSubmissionsResult>('/submissions:distribute', body)
      .then((r) => r.data),

  // ---- feedback ----
  listFeedback: (id: string, signal?: AbortSignal) =>
    api
      .get<Paginated<SubmissionFeedback> | SubmissionFeedback[]>(
        `/submissions/${id}/feedback`,
        { signal },
      )
      .then((r) => normalisePaginated(r.data)),

  addFeedback: (id: string, input: CreateFeedbackInput) =>
    api
      .post<SubmissionFeedback>(`/submissions/${id}/feedback`, input)
      .then((r) => r.data),

  patchFeedback: (
    id: string,
    fb_id: string,
    input: { body?: string; visible_to_student?: boolean },
  ) =>
    api
      .patch<SubmissionFeedback>(`/submissions/${id}/feedback/${fb_id}`, input)
      .then((r) => r.data),

  publishFeedback: (id: string, fb_id: string) =>
    api
      .post<SubmissionFeedback>(`/submissions/${id}/feedback/${fb_id}:publish`)
      .then((r) => r.data),

  unpublishFeedback: (id: string, fb_id: string) =>
    api
      .post<SubmissionFeedback>(`/submissions/${id}/feedback/${fb_id}:unpublish`)
      .then((r) => r.data),

  deleteFeedback: (id: string, fb_id: string) =>
    api.delete<void>(`/submissions/${id}/feedback/${fb_id}`).then((r) => r.data),

  // ---- flags ----
  listFlags: (id: string) =>
    api
      .get<Paginated<SubmissionFlag> | SubmissionFlag[]>(`/submissions/${id}/flags`)
      .then((r) => normalisePaginated(r.data)),

  addFlag: (id: string, input: CreateFlagInput) =>
    api.post<SubmissionFlag>(`/submissions/${id}/flags`, input).then((r) => r.data),

  removeFlag: (id: string, flag_id: string) =>
    api.delete<void>(`/submissions/${id}/flags/${flag_id}`).then((r) => r.data),
};
