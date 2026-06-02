/**
 * React Query hooks for homeworks (the intermediate level between Course and
 * Assignment).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  homeworksApi,
  type CreateHomeworkInput,
  type HomeworkListFilters,
  type UpdateHomeworkInput,
} from '@/api/endpoints/homeworks';
import type { ListParams } from '@/api/pagination';

export const homeworkKeys = {
  all: ['homeworks'] as const,
  forCourse: (course_id: string) =>
    ['homeworks', 'course', course_id] as const,
  detail: (id: string) => ['homeworks', 'detail', id] as const,
  assignments: (id: string) => ['homeworks', id, 'assignments'] as const,
};

export function useHomeworksForCourse(
  course_id: string | undefined,
  filters: HomeworkListFilters = {},
) {
  return useQuery({
    queryKey: [...homeworkKeys.forCourse(course_id ?? ''), filters],
    queryFn: () => homeworksApi.listForCourse(course_id as string, filters),
    enabled: !!course_id,
    // Homeworks are created on a separate /homeworks/new page, which
    // invalidates this list while the course page is unmounted. With the
    // global refetchOnMount:false that left the new ДЗ invisible until a hard
    // reload — opt back into refetch-on-mount so the invalidation lands.
    refetchOnMount: true,
  });
}

export function useHomework(id: string | undefined) {
  return useQuery({
    queryKey: homeworkKeys.detail(id ?? ''),
    queryFn: () => homeworksApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateHomework(course_id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHomeworkInput) =>
      homeworksApi.create(course_id, input),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: homeworkKeys.forCourse(course_id),
      });
    },
  });
}

export function useUpdateHomework(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateHomeworkInput) => homeworksApi.update(id, input),
    onSuccess: (data) => {
      qc.setQueryData(homeworkKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

export function useDeleteHomework(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => homeworksApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

export function useHomeworkAssignments(
  id: string | undefined,
  params: ListParams = {},
) {
  return useQuery({
    queryKey: [...homeworkKeys.assignments(id ?? ''), params],
    queryFn: () => homeworksApi.listAssignments(id as string, params),
    enabled: !!id,
  });
}
