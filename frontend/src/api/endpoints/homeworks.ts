/**
 * Homework endpoints (Course Service).
 *
 * Homework is the intermediate level between Course and Assignment — a "weekly
 * pack" of related assignments. See `services/course/src/course_service/schemas/homework.py`.
 *
 * Note: backend models IDs as `int`, but the frontend treats every domain id as
 * `string` for URL interpolation consistency with the rest of the API client.
 */
import api from '../client';
import type { Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';
import type { AssignmentBrief } from './assignments';

// -------------------- Domain types --------------------

export type HomeworkStatus = 'draft' | 'published' | 'archived';

export interface Homework {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  description: string | null;
  position: number;
  status: HomeworkStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string | null;
}

// -------------------- Inputs --------------------

export interface CreateHomeworkInput {
  // No slug — the backend auto-derives it from ``title``.
  title: string;
  description?: string | null;
  position?: number;
  status?: HomeworkStatus;
  due_at?: string | null;
}

export interface UpdateHomeworkInput {
  title?: string;
  description?: string | null;
  position?: number;
  status?: HomeworkStatus;
  due_at?: string | null;
}

export interface HomeworkListFilters extends ListParams {
  status?: HomeworkStatus;
}

// -------------------- API --------------------

export const homeworksApi = {
  listForCourse: (course_id: string, params: HomeworkListFilters = {}) => {
    const base = buildListParams(params);
    if (params.status) base.status = params.status;
    return api
      .get<Paginated<Homework>>(`/courses/${course_id}/homeworks`, {
        params: base,
      })
      .then((r) => r.data);
  },

  get: (id: string) => api.get<Homework>(`/homeworks/${id}`).then((r) => r.data),

  create: (course_id: string, input: CreateHomeworkInput) =>
    api.post<Homework>(`/courses/${course_id}/homeworks`, input).then((r) => r.data),

  update: (id: string, input: UpdateHomeworkInput) =>
    api.patch<Homework>(`/homeworks/${id}`, input).then((r) => r.data),

  delete: (id: string) =>
    api.delete<void>(`/homeworks/${id}`).then((r) => r.data),

  listAssignments: (id: string, params: ListParams = {}) =>
    api
      .get<Paginated<AssignmentBrief>>(`/homeworks/${id}/assignments`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),
};
