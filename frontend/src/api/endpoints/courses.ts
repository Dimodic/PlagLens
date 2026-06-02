/**
 * Course Service endpoints.
 */
import api from '../client';
import type { CourseRole, Operation, Paginated, UserSummary } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// -------------------- Domain types --------------------

export type CourseStatus = 'draft' | 'active' | 'archived';

export interface CourseSettings {
  cors_origins?: string[];
  default_plagiarism_provider?: string;
  default_ai_provider?: string;
  [k: string]: unknown;
}

export interface CourseBrief {
  id: string;
  name: string;
  slug: string;
  status: CourseStatus;
  semester?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  owner_id?: string;
  members_count?: number;
  assignments_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Course extends CourseBrief {
  description: string;
  settings: CourseSettings;
}

export interface CourseOwner {
  user_id: string;
  user?: UserSummary;
  role: 'owner' | 'co_owner';
  assigned_at: string;
}

export interface CourseMember {
  id: string;
  user_id: string;
  // The course service stores no user profile — ``user`` is only
  // populated when the caller resolves names itself (see useUsers).
  user?: UserSummary;
  // Backend field is ``role`` (per-course role: student | assistant).
  role: CourseRole;
  joined_at: string;
  removed_at?: string | null;
  group_id?: string | null;
}

export interface Group {
  id: string;
  course_id: string;
  name: string;
  capacity: number | null;
  members_count?: number;
  created_at: string;
}

export interface Invitation {
  id: string;
  course_id: string;
  code: string;
  role: 'student' | 'assistant';
  email?: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface CourseListFilters extends ListParams {
  status?: CourseStatus;
  owner?: string;
  member?: string;
  archived?: boolean;
}

// -------------------- Inputs --------------------

export interface CreateCourseInput {
  // No slug — the backend auto-derives it from ``name``. Slugs are
  // internal / URL-only now; users never type or see them.
  name: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  semester?: string;
}

export interface UpdateCourseInput {
  name?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  settings?: CourseSettings;
  status?: CourseStatus;
}

export interface AddMemberInput {
  user_id: string;
  role: 'student' | 'assistant';
}

export interface BulkInviteInput {
  emails: string[];
  role: 'student' | 'assistant';
  message?: string;
}

export interface CreateInvitationInput {
  role: 'student' | 'assistant';
  email?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
}

export interface CreateGroupInput {
  name: string;
  capacity?: number | null;
}

// -------------------- API --------------------

export const coursesApi = {
  list: (params: CourseListFilters = {}) => {
    const base = buildListParams(params);
    if (params.status) base.status = params.status;
    if (params.owner) base.owner = params.owner;
    if (params.member) base.member = params.member;
    if (params.archived !== undefined) base.archived = String(params.archived);
    return api.get<Paginated<CourseBrief>>('/courses', { params: base }).then((r) => r.data);
  },

  myCourses: (params: ListParams = {}) =>
    api
      .get<Paginated<CourseBrief>>('/users/me/courses', { params: buildListParams(params) })
      .then((r) => r.data),

  get: (id: string) => api.get<Course>(`/courses/${id}`).then((r) => r.data),

  create: (input: CreateCourseInput) =>
    api.post<Course>('/courses', input).then((r) => r.data),

  update: (id: string, input: UpdateCourseInput) =>
    api.patch<Course>(`/courses/${id}`, input).then((r) => r.data),

  delete: (id: string) => api.delete<void>(`/courses/${id}`).then((r) => r.data),

  archive: (id: string) =>
    api.post<Course>(`/courses/${id}:archive`).then((r) => r.data),

  unarchive: (id: string) =>
    api.post<Course>(`/courses/${id}:unarchive`).then((r) => r.data),

  duplicate: (id: string) =>
    // Synchronous: returns the fully-created clone (not an Operation).
    // Body required by the endpoint (CourseDuplicate — both new_slug /
    // new_name optional); send {} so it isn't a 422 "body field required".
    api.post<Course>(`/courses/${id}:duplicate`, {}).then((r) => r.data),

  // Invitation codes are issued and stored by the identity service
  // (identity.invitations) and redeemed there — identity also creates the
  // course membership. The old course-submission /courses:joinByCode only knew
  // course-local codes and returned 404 for identity-issued ones, so route
  // through the canonical redeem endpoint. Return shape kept as { course_id }
  // for the existing callers (JoinByCodeDialog / JoinByCodePage).
  joinByCode: (code: string) =>
    api
      .post<{ course_id: string | null }>('/invitations:redeem', { code })
      .then((r) => ({ course_id: r.data.course_id ?? '' })),

  // ---- owners ----
  // NB: this endpoint returns a *bare array* (``list[OwnerRead]``), not a
  // ``{data, pagination}`` envelope — owners are a tiny set. Typing it as
  // Paginated and reading ``.data.data`` was the bug behind the dead
  // "Распределить" button (grader pool came back empty).
  listOwners: (id: string) =>
    api.get<CourseOwner[]>(`/courses/${id}/owners`).then((r) => r.data),
  addOwner: (id: string, user_id: string) =>
    api.post<CourseOwner>(`/courses/${id}/owners`, { user_id }).then((r) => r.data),
  removeOwner: (id: string, user_id: string) =>
    api.delete<void>(`/courses/${id}/owners/${user_id}`).then((r) => r.data),
  promoteOwner: (id: string, user_id: string) =>
    api
      .post<CourseOwner>(`/courses/${id}/owners/${user_id}:promote`)
      .then((r) => r.data),

  // ---- members ----
  listMembers: (id: string, params: ListParams & { role?: CourseRole } = {}) => {
    const base = buildListParams(params);
    if (params.role) base.role = params.role;
    return api
      .get<Paginated<CourseMember>>(`/courses/${id}/members`, { params: base })
      .then((r) => r.data);
  },
  addMember: (id: string, input: AddMemberInput) =>
    api.post<CourseMember>(`/courses/${id}/members`, input).then((r) => r.data),
  bulkInvite: (id: string, input: BulkInviteInput) =>
    api
      .post<Operation>(`/courses/${id}/members:bulkInvite`, input)
      .then((r) => r.data),
  removeMember: (id: string, user_id: string) =>
    api.delete<void>(`/courses/${id}/members/${user_id}`).then((r) => r.data),
  changeMemberRole: (id: string, user_id: string, role: CourseRole) =>
    api
      .patch<CourseMember>(`/courses/${id}/members/${user_id}`, { role })
      .then((r) => r.data),
  transferGroup: (
    id: string,
    user_id: string,
    group_id: string | null,
  ) =>
    api
      .post<CourseMember>(`/courses/${id}/members/${user_id}:transfer-group`, {
        group_id,
      })
      .then((r) => r.data),

  // ---- invitations ----
  listInvitations: (id: string) =>
    api
      .get<Paginated<Invitation>>(`/courses/${id}/invitations`)
      .then((r) => r.data),
  createInvitation: (id: string, input: CreateInvitationInput) =>
    api.post<Invitation>(`/courses/${id}/invitations`, input).then((r) => r.data),
  deleteInvitation: (id: string, inv_id: string) =>
    api.delete<void>(`/courses/${id}/invitations/${inv_id}`).then((r) => r.data),

  // ---- groups ----
  listGroups: (id: string) =>
    api.get<Paginated<Group>>(`/courses/${id}/groups`).then((r) => r.data),
  createGroup: (id: string, input: CreateGroupInput) =>
    api.post<Group>(`/courses/${id}/groups`, input).then((r) => r.data),
  updateGroup: (id: string, group_id: string, input: Partial<CreateGroupInput>) =>
    api.patch<Group>(`/courses/${id}/groups/${group_id}`, input).then((r) => r.data),
  deleteGroup: (id: string, group_id: string) =>
    api.delete<void>(`/courses/${id}/groups/${group_id}`).then((r) => r.data),
  listGroupMembers: (id: string, group_id: string) =>
    api
      .get<Paginated<CourseMember>>(`/courses/${id}/groups/${group_id}/members`)
      .then((r) => r.data),
  addGroupMember: (id: string, group_id: string, user_id: string) =>
    api
      .post<CourseMember>(`/courses/${id}/groups/${group_id}/members`, {
        user_id,
      })
      .then((r) => r.data),
  removeGroupMember: (id: string, group_id: string, user_id: string) =>
    api
      .delete<void>(`/courses/${id}/groups/${group_id}/members/${user_id}`)
      .then((r) => r.data),
};
