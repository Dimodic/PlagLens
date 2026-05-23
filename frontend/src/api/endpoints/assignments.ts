/**
 */
import api from '../client';
import type { Operation, Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// -------------------- Domain types --------------------

export type AssignmentStatus = 'draft' | 'published' | 'archived';
export type SelectionStrategy = 'last' | 'best' | 'manual';

export interface ExternalBinding {
  system: 'stepik' | 'yandex_contest' | 'manual' | string;
  external_assignment_id: string;
}

export interface AssignmentBrief {
  id: string;
  course_id: string;
  /** Homework this assignment belongs to (nullable for legacy data). */
  homework_id?: string | null;
  slug: string;
  title: string;
  status: AssignmentStatus;
  language_hint?: string;
  max_score?: number;
  weight?: number;
  deadline_soft_at?: string | null;
  deadline_hard_at?: string | null;
  due_at?: string | null;
}

export interface Assignment extends AssignmentBrief {
  description: string;
  late_score_multiplier: number;
  selection_strategy: SelectionStrategy;
  plagiarism_auto_run: boolean;
  plagiarism_threshold: number;
  ai_auto_run: boolean;
  ai_prompt_version: string | null;
  external_bindings: ExternalBinding[];
  created_at: string;
  updated_at: string;
}

export interface DeadlineInfo {
  deadline_soft_at: string | null;
  deadline_hard_at: string | null;
  late_score_multiplier: number;
}

export interface DeadlineExtension {
  id: string;
  assignment_id: string;
  user_id: string;
  user_display_name?: string;
  deadline_soft_at: string | null;
  deadline_hard_at: string | null;
  reason: string | null;
  created_at: string;
}

export interface GradingConfig {
  rubric: Record<string, unknown>;
  pass_threshold: number | null;
  visible_to_students_at: string | null;
}

export interface AssignmentStats {
  submissions_count: number;
  students_submitted: number;
  average_score: number | null;
  plagiarism_alerts: number;
  ai_runs: number;
}

// -------------------- Inputs --------------------

export interface CreateAssignmentInput {
  // No slug — the backend auto-derives it from ``title``.
  title: string;
  description: string;
  language_hint?: string;
  max_score: number;
  weight: number;
  deadline_soft_at?: string | null;
  deadline_hard_at?: string | null;
  late_score_multiplier?: number;
  selection_strategy?: SelectionStrategy;
  plagiarism_auto_run?: boolean;
  plagiarism_threshold?: number;
  ai_auto_run?: boolean;
  ai_prompt_version?: string | null;
  external_bindings?: ExternalBinding[];
  /** Optional homework — if omitted, backend assigns to the course's
   * "Default homework" automatically. */
  homework_id?: string | null;
}

export type UpdateAssignmentInput = Partial<CreateAssignmentInput>;

export interface CreateDeadlineExtensionInput {
  user_id: string;
  deadline_soft_at: string | null;
  deadline_hard_at: string | null;
  reason?: string;
}

export interface UpdateGradingConfigInput {
  rubric?: Record<string, unknown>;
  pass_threshold?: number | null;
  visible_to_students_at?: string | null;
}

export interface AssignmentListFilters extends ListParams {
  status?: AssignmentStatus;
  course_id?: string;
  /** Filter by homework when listing within a course. */
  homework_id?: string;
}

// -------------------- API --------------------

export const assignmentsApi = {
  listInCourse: (course_id: string, params: AssignmentListFilters = {}) => {
    const base = buildListParams(params);
    if (params.status) base.status = params.status;
    if (params.homework_id) base.homework_id = params.homework_id;
    return api
      .get<Paginated<AssignmentBrief>>(`/courses/${course_id}/assignments`, {
        params: base,
      })
      .then((r) => r.data);
  },

  list: (params: AssignmentListFilters = {}) => {
    const base = buildListParams(params);
    if (params.status) base.status = params.status;
    if (params.course_id) base.course_id = params.course_id;
    return api
      .get<Paginated<AssignmentBrief>>('/assignments', { params: base })
      .then((r) => r.data);
  },

  myAssignments: (params: ListParams = {}) =>
    api
      .get<Paginated<AssignmentBrief>>('/users/me/assignments', {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  upcoming: () =>
    api
      .get<Paginated<AssignmentBrief>>('/users/me/assignments/upcoming')
      .then((r) => r.data),

  get: (id: string) => api.get<Assignment>(`/assignments/${id}`).then((r) => r.data),

  create: (course_id: string, input: CreateAssignmentInput) =>
    api
      .post<Assignment>(`/courses/${course_id}/assignments`, input)
      .then((r) => r.data),

  update: (id: string, input: UpdateAssignmentInput) =>
    api.patch<Assignment>(`/assignments/${id}`, input).then((r) => r.data),

  delete: (id: string) => api.delete<void>(`/assignments/${id}`).then((r) => r.data),

  publish: (id: string) =>
    api.post<Assignment>(`/assignments/${id}:publish`).then((r) => r.data),

  archive: (id: string) =>
    api.post<Assignment>(`/assignments/${id}:archive`).then((r) => r.data),

  duplicate: (id: string, target_course_id?: string) =>
    // The backend auto-derives the clone's slug from its title — no
    // ``new_slug`` to pass. Slugs are internal / URL-only now.
    api
      .post<Operation>(`/assignments/${id}:duplicate`, { target_course_id })
      .then((r) => r.data),

  // ---- deadlines ----
  getDeadlines: (id: string) =>
    api.get<DeadlineInfo>(`/assignments/${id}/deadlines`).then((r) => r.data),

  updateDeadlines: (id: string, input: Partial<DeadlineInfo>) =>
    api
      .patch<DeadlineInfo>(`/assignments/${id}/deadlines`, input)
      .then((r) => r.data),

  effectiveDeadlineFor: (id: string, user_id: string) =>
    api
      .get<DeadlineInfo>(`/assignments/${id}/deadlines/effective-for/${user_id}`)
      .then((r) => r.data),

  listDeadlineExtensions: (id: string) =>
    api
      .get<Paginated<DeadlineExtension> | DeadlineExtension[]>(
        `/assignments/${id}/deadline-extensions`,
      )
      .then((r) => {
        const body = r.data as
          | Paginated<DeadlineExtension>
          | DeadlineExtension[];
        if (Array.isArray(body)) {
          return {
            data: body,
            pagination: { has_more: false, limit: body.length, next_cursor: null },
          } as Paginated<DeadlineExtension>;
        }
        return body;
      }),

  createDeadlineExtension: (id: string, input: CreateDeadlineExtensionInput) =>
    api
      .post<DeadlineExtension>(`/assignments/${id}/deadline-extensions`, input)
      .then((r) => r.data),

  deleteDeadlineExtension: (id: string, ext_id: string) =>
    api
      .delete<void>(`/assignments/${id}/deadline-extensions/${ext_id}`)
      .then((r) => r.data),

  // ---- grading config ----
  getGradingConfig: (id: string) =>
    api.get<GradingConfig>(`/assignments/${id}/grading-config`).then((r) => r.data),

  updateGradingConfig: (id: string, input: UpdateGradingConfigInput) =>
    api
      .patch<GradingConfig>(`/assignments/${id}/grading-config`, input)
      .then((r) => r.data),

  // ---- stats ----
  getStats: (id: string) =>
    api.get<AssignmentStats>(`/assignments/${id}/stats`).then((r) => r.data),
};
