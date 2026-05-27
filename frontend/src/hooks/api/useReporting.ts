/**
 * React Query hooks for Reporting Service exports + Google Sheets + scheduled.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  reportingApi,
  type CreateExportInput,
  type CreateScheduledExportInput,
  type ExportListFilter,
} from '@/api/endpoints/reporting';
import type { ListParams } from '@/api/pagination';

export const exportKeys = {
  all: ['exports'] as const,
  list: (filters: ExportListFilter) => ['exports', 'list', filters] as const,
  course: (id: string, filters: ListParams) =>
    ['exports', 'course', id, filters] as const,
  detail: (id: string) => ['exports', 'detail', id] as const,
  scheduled: (courseId: string) =>
    ['exports', 'scheduled', courseId] as const,
  sheetsLink: (courseId: string) =>
    ['exports', 'sheets-link', courseId] as const,
  lastSync: (courseId: string) =>
    ['exports', 'sheets-last-sync', courseId] as const,
};

// -------------------- Queries --------------------

export function useExports(
  filters: ExportListFilter = {},
  options?: {
    /** Poll the list while it's mounted — used by the Export page to
     *  watch a freshly-created job tick queued → running → completed
     *  without a manual refresh. Accepts the TanStack function form so
     *  callers can poll only while a job is still active. */
    refetchInterval?:
      | number
      | false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | ((query: any) => number | false);
  },
) {
  return useQuery({
    queryKey: exportKeys.list(filters),
    queryFn: () => reportingApi.listExports(filters),
    refetchInterval: options?.refetchInterval,
  });
}

export function useCourseExports(
  courseId: string | undefined,
  filters: ListParams = {},
) {
  return useQuery({
    queryKey: exportKeys.course(courseId ?? '', filters),
    queryFn: () => reportingApi.listCourseExports(courseId as string, filters),
    enabled: !!courseId,
  });
}

export function useExport(id: string | undefined) {
  return useQuery({
    queryKey: exportKeys.detail(id ?? ''),
    queryFn: () => reportingApi.getExport(id as string),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 3000 : false;
    },
  });
}

export function useScheduledExports(courseId: string | undefined) {
  return useQuery({
    queryKey: exportKeys.scheduled(courseId ?? ''),
    queryFn: () => reportingApi.listScheduled(courseId as string),
    enabled: !!courseId,
  });
}

export function useGoogleSheetsLink(courseId: string | undefined) {
  return useQuery({
    queryKey: exportKeys.sheetsLink(courseId ?? ''),
    queryFn: () => reportingApi.getSheetsLink(courseId as string),
    enabled: !!courseId,
  });
}

export function useGoogleSheetsLastSync(courseId: string | undefined) {
  return useQuery({
    queryKey: exportKeys.lastSync(courseId ?? ''),
    queryFn: () => reportingApi.lastSync(courseId as string),
    enabled: !!courseId,
  });
}

// -------------------- Mutations --------------------

export function useCreateExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExportInput) =>
      reportingApi.startGenericExport(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useCreateCourseExport(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExportInput) =>
      reportingApi.startCourseExport(courseId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useDownloadExport() {
  return useMutation({
    mutationFn: (id: string) => reportingApi.downloadExport(id),
  });
}

export function useRetryExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportingApi.retryExport(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useCancelExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportingApi.cancelExport(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useDeleteExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportingApi.deleteExport(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useCreateScheduledExport(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduledExportInput) =>
      reportingApi.createScheduled(courseId, input),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.scheduled(courseId),
      });
    },
  });
}

export function useDeleteScheduledExport(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      reportingApi.deleteScheduled(courseId, scheduleId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.scheduled(courseId),
      });
    },
  });
}

export function useRunScheduledNow(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      reportingApi.runScheduledNow(courseId, scheduleId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.scheduled(courseId),
      });
      void qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useSetSheetsLink(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      spreadsheet_id?: string;
      sheet_name?: string;
      columns_mapping?: Record<string, string>;
    }) => reportingApi.setSheetsLink(courseId, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.sheetsLink(courseId),
      });
    },
  });
}

export function useCreateSheetsLink(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      spreadsheet_id: string;
      sheet_name: string;
      columns_mapping?: Record<string, string>;
    }) => reportingApi.createSheetsLink(courseId, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.sheetsLink(courseId),
      });
    },
  });
}

export function useDeleteSheetsLink(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reportingApi.deleteSheetsLink(courseId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.sheetsLink(courseId),
      });
    },
  });
}

export function useValidateSheetsLink(courseId: string) {
  return useMutation({
    mutationFn: () => reportingApi.validateSheetsLink(courseId),
  });
}

export function useSyncSheets(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reportingApi.syncSheets(courseId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: exportKeys.lastSync(courseId),
      });
    },
  });
}

/** Imperative loader for the spreadsheet preview — fired when the user
 *  pastes a spreadsheet ID and clicks "Загрузить". A mutation (not a
 *  query) so we only hit Google on explicit user action; results are
 *  held in component state, not the react-query cache. */
export function usePreviewSpreadsheet() {
  return useMutation({
    mutationFn: (vars: {
      spreadsheetId: string;
      max_rows?: number;
      max_cols?: number;
    }) =>
      reportingApi.previewSpreadsheet(vars.spreadsheetId, {
        max_rows: vars.max_rows,
        max_cols: vars.max_cols,
      }),
  });
}

/** Dry-run the grade matrix builder and return what would be written.
 *  Used by the «Подставить оценки» button on the export page — paints
 *  the matrix into the Univer preview at the chosen anchor cell so the
 *  teacher can inspect the values before the real "Записать в таблицу"
 *  commit. */
export function usePreviewGrades() {
  return useMutation({
    mutationFn: (body: {
      course_id: string;
      homework_ids: string[];
      options?: Record<string, unknown>;
    }) => reportingApi.previewGrades(body),
  });
}
