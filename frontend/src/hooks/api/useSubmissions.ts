/**
 * React Query hooks for submissions.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  submissionsApi,
  type CreateFeedbackInput,
  type CreateFlagInput,
  type CreateGradeInput,
  type DistributeSubmissionsInput,
  type SubmissionFeedback,
  type SubmissionListFilters,
} from '@/api/endpoints/submissions';
import type { Paginated } from '@/api/types';

export const submissionKeys = {
  all: ['submissions'] as const,
  byAssignment: (assignment_id: string, filters: SubmissionListFilters) =>
    ['submissions', 'assignment', assignment_id, filters] as const,
  myList: (filters?: SubmissionListFilters) =>
    ['submissions', 'me', filters ?? {}] as const,
  detail: (id: string) => ['submissions', 'detail', id] as const,
  files: (id: string) => ['submissions', id, 'files'] as const,
  fileContent: (id: string, file_id: string) =>
    ['submissions', id, 'files', file_id, 'content'] as const,
  grade: (id: string) => ['submissions', id, 'grade'] as const,
  gradeHistory: (id: string) => ['submissions', id, 'grade', 'history'] as const,
  feedback: (id: string) => ['submissions', id, 'feedback'] as const,
  flags: (id: string) => ['submissions', id, 'flags'] as const,
  history: (id: string) => ['submissions', id, 'history'] as const,
  externalParticipants: (course_id: string) =>
    ['submissions', 'external-participants', course_id] as const,
};

export function useSubmissions(
  assignment_id: string | undefined,
  filters: SubmissionListFilters = {},
) {
  return useQuery({
    queryKey: submissionKeys.byAssignment(assignment_id ?? '', filters),
    queryFn: () =>
      submissionsApi.listForAssignment(assignment_id as string, filters),
    enabled: !!assignment_id,
  });
}

/** One row per student — only their latest submission for the assignment.
 *  Lets the grader's list collapse from "Петров v1, v2, v3, v4" to just
 *  "Петров" with the current version, and the popover on the submission
 *  page can still take them back through earlier attempts. */
export function useLatestPerStudent(assignment_id: string | undefined) {
  return useQuery({
    queryKey: [...submissionKeys.all, 'latest-per-student', assignment_id ?? ''],
    queryFn: ({ signal }) =>
      submissionsApi.latestPerStudent(assignment_id as string, signal),
    enabled: !!assignment_id,
  });
}

/** All grades for the assignment in one shot. Used by the submissions
 *  list (grade chip) and the stats tab (mean + score histogram).
 *
 *  ``refetchOnMount: true`` overrides the global ``false`` default:
 *  grades are set on a *different* page (the submission detail), so
 *  when the grade mutation invalidates this query it's inactive — and
 *  with the global ``refetchOnMount: false`` an invalidated-but-inactive
 *  query would still serve stale cache on the next mount. ``true`` lets
 *  it refetch when it remounts stale (invalidation marks it stale
 *  regardless of ``staleTime``), so a freshly-set grade shows up. */
export function useAssignmentGrades(assignment_id: string | undefined) {
  return useQuery({
    queryKey: [...submissionKeys.all, 'assignment-grades', assignment_id ?? ''],
    queryFn: ({ signal }) =>
      submissionsApi.listAssignmentGrades(assignment_id as string, signal),
    enabled: !!assignment_id,
    refetchOnMount: true,
  });
}

/** Backend-aggregated stats for an assignment. Replaces the broken
 *  course_service ``/stats`` stub (which returned hardcoded zeros) —
 *  numbers come from a single DB query in submission_service that joins
 *  latest-per-student with grades. */
export function useAssignmentAggregateStats(
  assignment_id: string | undefined,
) {
  return useQuery({
    queryKey: [
      ...submissionKeys.all,
      'assignment-aggregate-stats',
      assignment_id ?? '',
    ],
    queryFn: ({ signal }) =>
      submissionsApi.assignmentAggregateStats(assignment_id as string, signal),
    enabled: !!assignment_id,
    // Same reasoning as useAssignmentGrades — grade mutations on other
    // pages invalidate this; let it refetch when it remounts stale.
    refetchOnMount: true,
  });
}

export function useMySubmissions(
  filters: SubmissionListFilters & { course_id?: string } = {},
) {
  return useQuery({
    queryKey: submissionKeys.myList(filters),
    queryFn: () => submissionsApi.mySubmissions(filters),
    // The assistant cabinet + «Все посылки» live on this query. Grades are
    // set on a *different* page (submission detail), whose mutation
    // invalidates this list while it's inactive. With the global
    // `refetchOnMount: false`, returning to the cabinet would keep serving
    // the stale cache (the "осталось 24" that only fixed itself on F5).
    // Opt into refetch-on-mount: invalidation marks the query stale
    // regardless of `staleTime`, so a freshly-graded submission drops out of
    // the pile the instant the grader navigates back.
    refetchOnMount: true,
  });
}

/** Unclaimed external (Yandex.Contest) participants imported into the
 *  course. Backs the teacher's "generate claim codes" dialog, so it's
 *  deferred until the dialog opens (`opts.enabled`). */
export function useExternalParticipants(
  course_id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: submissionKeys.externalParticipants(course_id ?? ''),
    queryFn: ({ signal }) =>
      submissionsApi.externalParticipants(course_id as string, signal),
    enabled: !!course_id && (opts.enabled ?? true),
    staleTime: 30_000,
  });
}

// Per-submission data is essentially immutable once a posylka is
// uploaded (the row itself, its files, its content) — there's no
// concurrent author editing it. A generous staleTime means walking
// back through 10 submissions doesn't trigger 10 re-fetches; React
// Query serves them from cache. We still honour `refetchOnWindowFocus`
// defaults so a manual refocus surfaces edits made elsewhere.
const PER_SUBMISSION_STALE_MS = 5 * 60_000;

export function useSubmission(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.detail(id ?? ''),
    // Pass React Query's `signal` down to axios so a still-in-flight
    // request for the *previous* submission is aborted at the HTTP
    // layer when the user hits ‹/›. Without this the abandoned
    // request keeps a connection slot warm and queues the next page's
    // requests behind it — the symptom is the "minute-long" load
    // after mashing the navigation arrows 10 times.
    queryFn: ({ signal }) => submissionsApi.get(id as string, signal),
    enabled: !!id,
    placeholderData: (prev) => prev,
    staleTime: PER_SUBMISSION_STALE_MS,
  });
}

export function useSubmissionFiles(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.files(id ?? ''),
    queryFn: ({ signal }) =>
      submissionsApi.listFiles(id as string, signal),
    enabled: !!id,
    placeholderData: (prev) => prev,
    staleTime: PER_SUBMISSION_STALE_MS,
  });
}

export function useSubmissionFileContent(
  id: string | undefined,
  file_id: string | undefined,
) {
  return useQuery({
    queryKey: submissionKeys.fileContent(id ?? '', file_id ?? ''),
    queryFn: ({ signal }) =>
      submissionsApi.getFileContent(
        id as string,
        file_id as string,
        signal,
      ),
    enabled: !!id && !!file_id,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useSubmissionHistory(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  // Defer until the caller actually needs the version list (typically
  // when the grader opens the v… popover). Avoids burning one of the
  // page's six HTTP/1.1 connection slots on data that's only used by
  // a rarely-clicked control.
  return useQuery({
    queryKey: submissionKeys.history(id ?? ''),
    queryFn: ({ signal }) => submissionsApi.history(id as string, signal),
    enabled: !!id && (opts.enabled ?? true),
    staleTime: PER_SUBMISSION_STALE_MS,
  });
}

// -------------------- Upload --------------------

export function useUploadSubmission(assignment_id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      submissionsApi.upload(assignment_id, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.all });
    },
  });
}

// -------------------- Grade --------------------

/** A grade change ripples up into the assignment-level rollups: the
 *  grade chip in the submissions list (``useAssignmentGrades``) and the
 *  Stats tab metrics + score histogram (``useAssignmentAggregateStats``).
 *  The per-submission grade mutation only knows the submission id, not
 *  the assignment, so we invalidate those query families by prefix —
 *  only a handful are ever cached, so the broad match is cheap. */
function invalidateGradeRollups(qc: QueryClient) {
  qc.invalidateQueries({
    queryKey: [...submissionKeys.all, 'assignment-grades'],
  });
  qc.invalidateQueries({
    queryKey: [...submissionKeys.all, 'assignment-aggregate-stats'],
  });
}

export function useGrade(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.grade(id ?? ''),
    queryFn: ({ signal }) => submissionsApi.getGrade(id as string, signal),
    enabled: !!id,
    retry: false, // grade may not exist yet — don't spam
    staleTime: PER_SUBMISSION_STALE_MS,
  });
}

export function useSetGrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGradeInput) => submissionsApi.setGrade(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.grade(id) });
      qc.invalidateQueries({ queryKey: submissionKeys.detail(id) });
      // Refresh the assistant cabinet's "remaining to check" pile (myList)
      // so a freshly-graded submission drops out of it on the next visit —
      // that's what makes the review queue shrink 24 → 22 on re-entry.
      qc.invalidateQueries({ queryKey: ['submissions', 'me'] });
      invalidateGradeRollups(qc);
    },
  });
}

export function useUpdateGrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateGradeInput>) =>
      submissionsApi.updateGrade(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.grade(id) });
      invalidateGradeRollups(qc);
    },
  });
}

export function useDeleteGrade(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submissionsApi.deleteGrade(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.grade(id) });
      // Un-grading returns the submission to the assistant's pile.
      qc.invalidateQueries({ queryKey: ['submissions', 'me'] });
      invalidateGradeRollups(qc);
    },
  });
}

export function useGradeHistory(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  // Same lazy pattern as useSubmissionHistory — the accordion below
  // the grade is collapsed by default, so we don't need to load its
  // payload until the teacher actually expands it.
  return useQuery({
    queryKey: submissionKeys.gradeHistory(id ?? ''),
    queryFn: ({ signal }) =>
      submissionsApi.gradeHistory(id as string, signal),
    enabled: !!id && (opts.enabled ?? true),
    retry: false, // endpoint may not exist yet — don't spam
    staleTime: PER_SUBMISSION_STALE_MS,
  });
}

// -------------------- Feedback --------------------

export function useFeedback(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.feedback(id ?? ''),
    queryFn: ({ signal }) =>
      submissionsApi.listFeedback(id as string, signal),
    enabled: !!id,
    staleTime: PER_SUBMISSION_STALE_MS,
  });
}

export function useAddFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) =>
      submissionsApi.addFeedback(id, input),
    // Splice the new feedback into the cached list synchronously and
    // do NOT trigger a refetch. The server gave us the canonical row
    // (mutationFn's return value), so we already have the truth — a
    // subsequent GET adds nothing.
    //
    // Important: we intentionally skip invalidateQueries here. With
    // FastAPI's "commit-after-response" session pattern, an invalidate
    // fired in onSuccess kicks off a GET *before* the POST's
    // transaction has actually committed. The refetch then returns the
    // pre-insert state and overwrites our optimistic update — the new
    // annotation flashes for ~50 ms and disappears. The next natural
    // refetch (route change, manual refresh) will pick up server state
    // anyway, so we don't need to invalidate proactively.
    onSuccess: (newFb) => {
      qc.setQueryData<Paginated<SubmissionFeedback> | undefined>(
        submissionKeys.feedback(id),
        (prev) => {
          if (!prev) {
            return {
              data: [newFb],
              pagination: {
                has_more: false,
                limit: 1,
                next_cursor: null,
              },
            } satisfies Paginated<SubmissionFeedback>;
          }
          // Guard against the same id sneaking in via a concurrent
          // refetch — replace rather than duplicate.
          const without = prev.data.filter((f) => f.id !== newFb.id);
          return { ...prev, data: [...without, newFb] };
        },
      );
    },
  });
}

export function usePatchFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fb_id,
      body,
      visible_to_student,
    }: {
      fb_id: string;
      body?: string;
      visible_to_student?: boolean;
    }) =>
      submissionsApi.patchFeedback(id, fb_id, { body, visible_to_student }),
    // Same rationale as useAddFeedback: write the updated row straight
    // into the cache. We skip invalidate to avoid a race with the
    // post-response commit in FastAPI's session dependency.
    onSuccess: (updated) => {
      qc.setQueryData<Paginated<SubmissionFeedback> | undefined>(
        submissionKeys.feedback(id),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((f) => (f.id === updated.id ? updated : f)),
          };
        },
      );
    },
  });
}

export function usePublishFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fb_id, publish }: { fb_id: string; publish: boolean }) =>
      publish
        ? submissionsApi.publishFeedback(id, fb_id)
        : submissionsApi.unpublishFeedback(id, fb_id),
    // Optimistic cache write so the eye-icon flips immediately.
    onSuccess: (updated) => {
      qc.setQueryData<Paginated<SubmissionFeedback> | undefined>(
        submissionKeys.feedback(id),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((f) => (f.id === updated.id ? updated : f)),
          };
        },
      );
    },
  });
}

export function useDeleteFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fb_id: string) => submissionsApi.deleteFeedback(id, fb_id),
    // Drop the row from cache locally so it disappears at click time.
    onSuccess: (_void, fb_id) => {
      qc.setQueryData<Paginated<SubmissionFeedback> | undefined>(
        submissionKeys.feedback(id),
        (prev) => {
          if (!prev) return prev;
          return { ...prev, data: prev.data.filter((f) => f.id !== fb_id) };
        },
      );
    },
  });
}

// -------------------- Flags --------------------

export function useFlags(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.flags(id ?? ''),
    queryFn: () => submissionsApi.listFlags(id as string),
    enabled: !!id,
  });
}

export function useFlagSubmission(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFlagInput) => submissionsApi.addFlag(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.flags(id) });
      qc.invalidateQueries({ queryKey: submissionKeys.detail(id) });
    },
  });
}

export function useUnflagSubmission(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flag_id: string) => submissionsApi.removeFlag(id, flag_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.flags(id) });
      qc.invalidateQueries({ queryKey: submissionKeys.detail(id) });
    },
  });
}

// -------------------- Selection / rerun --------------------

export function useSelectSubmission(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (selected: boolean) =>
      selected ? submissionsApi.select(id) : submissionsApi.unselect(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: submissionKeys.detail(id) }),
  });
}

export function useRerunChecks(id: string) {
  return useMutation({
    mutationFn: () => submissionsApi.rerunChecks(id),
  });
}

/** Round-robin a course's / assignment's submissions across assistants.
 *  Invalidates the submission queries broadly so the freshly-assigned
 *  grader shows up on every list that displays it. */
export function useDistributeSubmissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DistributeSubmissionsInput) =>
      submissionsApi.distribute(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.all });
    },
  });
}
