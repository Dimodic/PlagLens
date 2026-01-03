/**
 * React Query hooks for assignments.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignmentsApi,
  type AssignmentListFilters,
  type CreateAssignmentInput,
  type CreateDeadlineExtensionInput,
  type UpdateAssignmentInput,
  type UpdateGradingConfigInput,
} from '@/api/endpoints/assignments';

export const assignmentKeys = {
  all: ['assignments'] as const,
  byCourse: (course_id: string) =>
    ['assignments', 'course', course_id] as const,
  list: (filters: AssignmentListFilters) =>
    ['assignments', 'list', filters] as const,
  myList: () => ['assignments', 'me'] as const,
  detail: (id: string) => ['assignments', 'detail', id] as const,
  deadlines: (id: string) => ['assignments', id, 'deadlines'] as const,
  extensions: (id: string) => ['assignments', id, 'extensions'] as const,
  grading: (id: string) => ['assignments', id, 'grading'] as const,
  stats: (id: string) => ['assignments', id, 'stats'] as const,
};

export function useAssignmentsByCourse(
  course_id: string | undefined,
  filters: AssignmentListFilters = {},
) {
  return useQuery({
    queryKey: [...assignmentKeys.byCourse(course_id ?? ''), filters],
    queryFn: () => assignmentsApi.listInCourse(course_id as string, filters),
    enabled: !!course_id,
  });
}

export function useMyAssignments() {
  return useQuery({
    queryKey: assignmentKeys.myList(),
    queryFn: () => assignmentsApi.myAssignments({ limit: 100 }),
  });
}

export function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.detail(id ?? ''),
    queryFn: () => assignmentsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateAssignment(course_id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      assignmentsApi.create(course_id, input),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: assignmentKeys.byCourse(course_id),
      });
    },
  });
}

export function useUpdateAssignment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAssignmentInput) =>
      assignmentsApi.update(id, input),
    onSuccess: (data) => {
      qc.setQueryData(assignmentKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(id),
    onSuccess: () => {
      // Affects every list (course, homework, my-assignments) — wipe broadly.
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
      qc.invalidateQueries({ queryKey: ['homeworks'] });
    },
  });
}

export function usePublishAssignment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => assignmentsApi.publish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.detail(id) });
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useArchiveAssignment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => assignmentsApi.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.detail(id) });
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useDuplicateAssignment(id: string) {
  return useMutation({
    mutationFn: (input?: { target_course_id?: string } | string) => {
      // Back-compat: accept the old positional `target_course_id` string.
      // The slug is auto-derived server-side — no ``new_slug`` to pass.
      if (typeof input === 'string' || input === undefined) {
        return assignmentsApi.duplicate(id, input as string | undefined);
      }
      return assignmentsApi.duplicate(id, input.target_course_id);
    },
  });
}

// -------------------- Deadlines --------------------

export function useDeadlines(id: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.deadlines(id ?? ''),
    queryFn: () => assignmentsApi.getDeadlines(id as string),
    enabled: !!id,
  });
}

export function useDeadlineExtensions(id: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.extensions(id ?? ''),
    queryFn: () => assignmentsApi.listDeadlineExtensions(id as string),
    enabled: !!id,
  });
}

export function useCreateDeadlineExtension(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeadlineExtensionInput) =>
      assignmentsApi.createDeadlineExtension(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: assignmentKeys.extensions(id) }),
  });
}

export function useDeleteDeadlineExtension(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ext_id: string) =>
      assignmentsApi.deleteDeadlineExtension(id, ext_id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: assignmentKeys.extensions(id) }),
  });
}

// -------------------- Grading config --------------------

export function useGradingConfig(id: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.grading(id ?? ''),
    queryFn: () => assignmentsApi.getGradingConfig(id as string),
    enabled: !!id,
  });
}

export function useUpdateGradingConfig(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGradingConfigInput) =>
      assignmentsApi.updateGradingConfig(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: assignmentKeys.grading(id) }),
  });
}

// -------------------- Stats --------------------

export function useAssignmentStats(id: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.stats(id ?? ''),
    queryFn: () => assignmentsApi.getStats(id as string),
    enabled: !!id,
  });
}
