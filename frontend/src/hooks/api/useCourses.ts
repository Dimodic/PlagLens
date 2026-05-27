/**
 * React Query hooks for courses.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  coursesApi,
  type AddMemberInput,
  type BulkInviteInput,
  type Course,
  type CourseListFilters,
  type CreateCourseInput,
  type CreateGroupInput,
  type CreateInvitationInput,
  type UpdateCourseInput,
} from '@/api/endpoints/courses';
import type { CourseRole, Operation } from '@/api/types';

export const courseKeys = {
  all: ['courses'] as const,
  list: (filters: CourseListFilters) =>
    ['courses', 'list', filters] as const,
  myList: () => ['courses', 'me'] as const,
  detail: (id: string) => ['courses', 'detail', id] as const,
  members: (id: string, role?: string) =>
    ['courses', id, 'members', role ?? 'all'] as const,
  groups: (id: string) => ['courses', id, 'groups'] as const,
  groupMembers: (id: string, group_id: string) =>
    ['courses', id, 'groups', group_id, 'members'] as const,
  invitations: (id: string) => ['courses', id, 'invitations'] as const,
  owners: (id: string) => ['courses', id, 'owners'] as const,
};

export function useCourses(filters: CourseListFilters = {}) {
  return useQuery({
    queryKey: courseKeys.list(filters),
    queryFn: () => coursesApi.list(filters),
  });
}

export function useMyCourses() {
  return useQuery({
    queryKey: courseKeys.myList(),
    queryFn: () => coursesApi.myCourses({ limit: 100 }),
  });
}

/**
 * Resolve a course by either numeric id or slug.
 * The backend currently only supports `GET /courses/{int_id}`, so when given a
 * slug we first hit the list endpoint with `q=` then fetch the detail by id.
 */
async function fetchCourseByIdOrSlug(idOrSlug: string): Promise<Course> {
  if (/^\d+$/.test(idOrSlug)) {
    return coursesApi.get(idOrSlug);
  }
  const list = await coursesApi.list({ q: idOrSlug, limit: 25 });
  const match = list.data.find((c) => c.slug === idOrSlug);
  if (!match) {
    const err: Error & { code?: string; status?: number } = new Error(
      `Course with slug "${idOrSlug}" not found`,
    );
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return coursesApi.get(String(match.id));
}

export function useCourse(
  id: string | undefined,
  options?: Partial<UseQueryOptions<Course>>,
) {
  return useQuery<Course>({
    queryKey: courseKeys.detail(id ?? ''),
    queryFn: () => fetchCourseByIdOrSlug(id as string),
    enabled: !!id,
    ...options,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) => coursesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useUpdateCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCourseInput) => coursesApi.update(id, input),
    onSuccess: (data) => {
      qc.setQueryData(courseKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useArchiveCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => coursesApi.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseKeys.detail(id) });
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useUnarchiveCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => coursesApi.unarchive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseKeys.detail(id) });
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useDuplicateCourse(id: string) {
  return useMutation<Operation, unknown, void>({
    mutationFn: () => coursesApi.duplicate(id),
  });
}

export function useDeleteCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => coursesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useJoinByCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => coursesApi.joinByCode(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseKeys.myList() });
    },
  });
}

// -------------------- Members --------------------

/** Course members. Pass ``role`` to filter server-side (e.g.
 *  ``'assistant'``) — without it, pagination could drop assistants
 *  past the first page in a course with many students. ``limit: 200``
 *  so a single page covers any realistic course roster. */
export function useCourseMembers(
  id: string | undefined,
  role?: 'student' | 'assistant',
) {
  return useQuery({
    queryKey: courseKeys.members(id ?? '', role),
    queryFn: () =>
      coursesApi.listMembers(id as string, { role, limit: 200 }),
    enabled: !!id,
  });
}

/** Course owners + co-owners. Separate from members because the course
 *  service models ownership in its own table (``/courses/{id}/owners``),
 *  not as a member role. Used by the submissions triage queue to build
 *  the full grader pool (owner + co_owner + assistant) for the
 *  "Распределить между ассистентами" action. */
export function useCourseOwners(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: courseKeys.owners(id ?? ''),
    queryFn: () => coursesApi.listOwners(id as string),
    enabled: !!id && (opts.enabled ?? true),
  });
}

export function useAddMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberInput) => coursesApi.addMember(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.members(id) }),
  });
}

export function useBulkInvite(id: string) {
  return useMutation({
    mutationFn: (input: BulkInviteInput) => coursesApi.bulkInvite(id, input),
  });
}

export function useRemoveMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (user_id: string) => coursesApi.removeMember(id, user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.members(id) }),
  });
}

export function useChangeMemberRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ user_id, role }: { user_id: string; role: CourseRole }) =>
      coursesApi.changeMemberRole(id, user_id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.members(id) }),
  });
}

// -------------------- Groups --------------------

export function useGroups(id: string | undefined) {
  return useQuery({
    queryKey: courseKeys.groups(id ?? ''),
    queryFn: () => coursesApi.listGroups(id as string),
    enabled: !!id,
  });
}

export function useCreateGroup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => coursesApi.createGroup(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.groups(id) }),
  });
}

export function useDeleteGroup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (group_id: string) => coursesApi.deleteGroup(id, group_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.groups(id) }),
  });
}

// -------------------- Invitations --------------------

export function useInvitations(id: string | undefined) {
  return useQuery({
    queryKey: courseKeys.invitations(id ?? ''),
    queryFn: () => coursesApi.listInvitations(id as string),
    enabled: !!id,
  });
}

export function useCreateInvitation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      coursesApi.createInvitation(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: courseKeys.invitations(id) }),
  });
}

export function useDeleteInvitation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inv_id: string) => coursesApi.deleteInvitation(id, inv_id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: courseKeys.invitations(id) }),
  });
}
