/**
 * /reports — «Экспорт».
 *
 * The teacher's grade-export workspace. Two routes for one matrix:
 *
 *   • **CSV** — pick a course + one or more ДЗ, click "Скачать оценки".
 *     File lands in the history list below; one click downloads it.
 *
 *   • **Google Sheets** — paste the spreadsheet URL/id, the page fetches
 *     a live preview (every tab, every cell, capped at ``max_rows ×
 *     max_cols``), renders it as a real grid with A/B/C and 1/2/3
 *     headers, and lets the teacher *drag a rectangle* to mark exactly
 *     where the grades block should land. The top-left of the rectangle
 *     becomes the export's anchor; grade comments ride along to native
 *     Google Sheets cell notes.
 *
 * Visual contract: minimal document-style. The previous incarnation
 * had four uppercase section labels, a 3-sentence intro paragraph, an
 * orphan "Другие отчёты" footer card and a heavy `<Table>` history —
 * the user read it as "перегружена". Stripped: page title + form +
 * action row + flat history list. Optional reports (course summary
 * etc.) live in a single secondary action on the page header.
 */
import { useMemo, useState } from 'react';
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/components/ui/utils';
import { ExportCreateModal } from '@/components/reporting/ExportCreateModal';
import { HomeworkMultiSelect } from '@/components/reporting/HomeworkMultiSelect';
import {
  UniverSpreadsheetPicker,
  selectionAnchor,
  type PaintRequest,
  type SheetSelection,
} from '@/components/reporting/UniverSpreadsheetPicker';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import {
  useCancelExport,
  useCreateExport,
  useCreateScheduledExport,
  useDeleteExport,
  useDeleteScheduledExport,
  useDownloadExport,
  useExports,
  usePreviewGrades,
  usePreviewSpreadsheet,
  useRetryExport,
  useRunScheduledNow,
  useScheduledExports,
} from '@/hooks/api/useReporting';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type {
  ExportFormat,
  ExportJob,
  ExportStatus,
  PreviewSpreadsheet,
  ScheduledExport,
} from '@/api/endpoints/reporting';
import type { Problem } from '@/api/types';

type GradesTarget = Extract<ExportFormat, 'csv' | 'google_sheets'>;

/** Accept either a raw ID or a full ``https://docs.google.com/spreadsheets/
 *  d/<id>/edit…`` URL — the latter is what teachers paste from the address
 *  bar most of the time. */
function pluralStudents(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'студентов';
  if (mod10 === 1) return 'студент';
  if (mod10 >= 2 && mod10 <= 4) return 'студента';
  return 'студентов';
}

function parseSpreadsheetId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : t;
}

export default function ExportPage() {
  useDocumentTitle('Экспорт');
  const notify = useNotifications();

  // ---------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------
  const [courseId, setCourseId] = useState('');
  const [homeworkIds, setHomeworkIds] = useState<string[]>([]);
  const [target, setTarget] = useState<GradesTarget>('csv');

  // Google Sheets target state
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [preview, setPreview] = useState<PreviewSpreadsheet | null>(null);
  const [selection, setSelection] = useState<SheetSelection | null>(null);
  const previewMut = usePreviewSpreadsheet();
  // Latest dry-run paint request handed to the Univer picker. Each
  // click on «Подставить оценки» mints a new object so the picker
  // sees a fresh reference and triggers its `applyPaint` effect.
  const [paint, setPaint] = useState<PaintRequest | null>(null);
  const previewGradesMut = usePreviewGrades();

  const { data: courses, isLoading: coursesLoading } = useMyCourses();
  const { data: homeworks, isLoading: hwLoading } = useHomeworksForCourse(
    courseId || undefined,
  );
  const create = useCreateExport();

  const courseItems = courses?.data ?? [];
  const homeworkOptions = useMemo(
    () =>
      (homeworks?.data ?? []).map((h) => ({
        id: String(h.id),
        title: h.title,
      })),
    [homeworks?.data],
  );

  // ---------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------
  const sheetsReady =
    target !== 'google_sheets' ||
    (preview !== null && selection !== null);
  const canExport =
    homeworkIds.length > 0 && sheetsReady && !create.isPending;

  /** Pithy reason the export button is disabled, shown inline. */
  const hint = (() => {
    if (create.isPending) return null;
    if (homeworkIds.length === 0) return 'Выберите хотя бы одно ДЗ';
    if (target === 'google_sheets' && preview === null)
      return 'Загрузите Google-таблицу';
    if (target === 'google_sheets' && selection === null)
      return 'Выделите прямоугольник в таблице';
    return null;
  })();

  const onLoadPreview = () => {
    const sid = parseSpreadsheetId(spreadsheetInput);
    if (!sid) {
      notify.error('Укажите ID или ссылку на Google-таблицу');
      return;
    }
    setSelection(null);
    previewMut.mutate(
      { spreadsheetId: sid },
      {
        onSuccess: (data) => {
          setPreview(data);
          if (data.worksheets.length === 0) {
            notify.info('В таблице нет листов');
          }
        },
        onError: (p) => {
          setPreview(null);
          notify.error(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              'Не удалось загрузить таблицу. Поделитесь ей с сервисным аккаунтом.',
          );
        },
      },
    );
  };

  const onExport = () => {
    if (!canExport) return;
    const scope: Record<string, unknown> = {
      homework_ids: homeworkIds,
      course_id: courseId,
    };
    if (target === 'google_sheets') {
      if (!preview || !selection) return;
      scope.spreadsheet_id = preview.spreadsheet_id;
      scope.sheet_title = selection.sheet_title;
      scope.anchor_cell = selectionAnchor(selection);
    }
    create.mutate(
      { kind: 'assignment_grades', format: target, scope },
      {
        onSuccess: () => {
          notify.success(
            target === 'google_sheets'
              ? `Запись запущена — оценки уедут в ${selection!.sheet_title} начиная с ${selectionAnchor(
                  selection!,
                )}`
              : 'Экспорт запущен — файл появится в истории ниже',
          );
        },
        onError: (p) => {
          notify.error(
            (p as unknown as Problem).title ||
              'Не удалось запустить экспорт',
          );
        },
      },
    );
  };

  /** Dry-run the grade matrix on the backend and paint it into the
   *  Univer preview, matching each backend row to the existing
   *  student-name row in the sheet (column A by default). Backend
   *  reuses the same assignment_grades builder the real export would
   *  call, so what the teacher sees is exactly what would land in
   *  the sheet on commit. */
  const onPaintPreview = async () => {
    if (!courseId || homeworkIds.length === 0 || !preview || !selection) {
      return;
    }
    try {
      const res = await previewGradesMut.mutateAsync({
        course_id: courseId,
        homework_ids: homeworkIds,
      });
      // Build a 2D matrix following the builder's column order. Row 0
      // is the header (column titles); subsequent rows are students.
      // First column is the student name — the picker uses it to
      // match against the existing names column in the sheet, then
      // writes columns 1..N at the matched row.
      const headerRow = res.columns.map((c) => c);
      const dataRows = res.rows.map((row) =>
        res.columns.map((col) => {
          const v = row[col];
          return v ?? '';
        }),
      );
      const matrix: (string | number | null)[][] = [headerRow, ...dataRows];
      const totalStudents = dataRows.length;
      setPaint({
        sheet: selection.sheet_title,
        anchorCol: selection.start_col,
        matrix,
        onApplied: ({ matched, skipped }) => {
          if (matched === 0) {
            notify.error(
              skipped > 0
                ? `Не удалось сопоставить ни одного студента из ${skipped}. Имена в столбце A не совпали с именами в системе.`
                : 'Нет оценок к подстановке — для выбранных ДЗ в системе пока ничего не оценено.',
            );
          } else {
            notify.success(
              skipped === 0
                ? `Подставлено ${matched} ${pluralStudents(matched)} из ${totalStudents}. Проверь и нажми «Записать в таблицу».`
                : `Подставлено ${matched} ${pluralStudents(matched)} из ${totalStudents}, ${skipped} не нашлось в столбце A.`,
            );
          }
        },
      });
    } catch (e) {
      notify.error(
        (e as unknown as Problem).title ||
          'Не удалось собрать превью оценок',
      );
    }
  };

  // ---------------------------------------------------------------------
  // Exports history (polled while anything is still working)
  // ---------------------------------------------------------------------
  const { data: exportsData, isLoading: exportsLoading } = useExports(
    {},
    {
      refetchInterval: (q) => {
        const rows: ExportJob[] = q.state.data?.data ?? [];
        return rows.some((j) => j.status === 'queued' || j.status === 'running')
          ? 3000
          : false;
      },
    },
  );
  const exportItems = exportsData?.data ?? [];
  const dl = useDownloadExport();
  const retry = useRetryExport();
  const cancel = useCancelExport();
  const remove = useDeleteExport();

  const onDownload = async (id: string) => {
    try {
      const r = await dl.mutateAsync(id);
      if (typeof window !== 'undefined') {
        window.open(r.url, '_blank', 'noopener');
      }
    } catch (p) {
      notify.error(
        (p as unknown as Problem).title || 'Не удалось получить ссылку',
      );
    }
  };

  // ---------------------------------------------------------------------
  // Saved bindings (auto-sync)
  // ---------------------------------------------------------------------
  const [saveOpen, setSaveOpen] = useState(false);
  const scheduledQ = useScheduledExports(courseId || undefined);
  const createSched = useCreateScheduledExport(courseId);
  const deleteSched = useDeleteScheduledExport(courseId);
  const runSched = useRunScheduledNow(courseId);

  const scheduledItems: ScheduledExport[] = useMemo(() => {
    const raw = scheduledQ.data as unknown;
    if (Array.isArray(raw)) return raw as ScheduledExport[];
    if (raw && typeof raw === 'object' && 'data' in raw) {
      const inner = (raw as { data?: unknown }).data;
      return Array.isArray(inner) ? (inner as ScheduledExport[]) : [];
    }
    return [];
  }, [scheduledQ.data]);
  const gradeBindings = useMemo(
    () => scheduledItems.filter((s) => s.kind === 'assignment_grades'),
    [scheduledItems],
  );

  const onSaveBinding = (cron: string) => {
    if (!courseId || homeworkIds.length === 0) return;
    if (target === 'google_sheets' && (!preview || !selection)) return;
    const scope: Record<string, unknown> = {
      homework_ids: homeworkIds,
      course_id: courseId,
    };
    if (target === 'google_sheets' && preview && selection) {
      scope.spreadsheet_id = preview.spreadsheet_id;
      scope.sheet_title = selection.sheet_title;
      scope.anchor_cell = selectionAnchor(selection);
    }
    createSched.mutate(
      {
        kind: 'assignment_grades',
        format: target,
        target: target === 'google_sheets' ? 'google_sheets' : 'file_download',
        cron,
        scope,
        enabled: true,
      },
      {
        onSuccess: () => {
          notify.success('Привязка сохранена — будет запускаться по расписанию');
          setSaveOpen(false);
        },
        onError: (p) => {
          notify.error(
            (p as unknown as Problem).title ||
              'Не удалось сохранить привязку',
          );
        },
      },
    );
  };

  const onSyncBindingNow = (id: string) => {
    runSched.mutate(id, {
      onSuccess: () =>
        notify.success('Запущено — посмотрите в истории ниже'),
      onError: (p) =>
        notify.error(
          (p as unknown as Problem).title || 'Не удалось запустить',
        ),
    });
  };

  const onDeleteBinding = (id: string) => {
    if (!confirm('Удалить привязку?')) return;
    deleteSched.mutate(id, {
      onSuccess: () => notify.success('Привязка удалена'),
      onError: (p) =>
        notify.error(
          (p as unknown as Problem).title || 'Не удалось удалить',
        ),
    });
  };

  // ---------------------------------------------------------------------
  // Secondary: other report kinds (course summary, plagiarism, ai)
  // ---------------------------------------------------------------------
  const [otherOpen, setOtherOpen] = useState(false);

  return (
    <Page width={target === 'google_sheets' && preview ? 'wide' : 'regular'}>
      <PageHeader
        title="Экспорт"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Действия"
                data-testid="export-page-menu"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setOtherOpen(true)}
                data-testid="export-other-open"
              >
                Другой отчёт…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* ---- PRIMARY: grades export form ---- */}
      <section className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="export-course">Курс</Label>
            <Select
              value={courseId}
              onValueChange={(v) => {
                setCourseId(v);
                setHomeworkIds([]);
              }}
            >
              <SelectTrigger id="export-course" data-testid="export-course">
                <SelectValue
                  placeholder={
                    coursesLoading ? 'Загрузка…' : 'Выберите курс'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {courseItems.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Домашние задания</Label>
            <HomeworkMultiSelect
              options={homeworkOptions}
              value={homeworkIds}
              onChange={setHomeworkIds}
              disabled={!courseId || hwLoading}
              loading={hwLoading}
              placeholder={
                !courseId ? 'Сначала выберите курс' : 'Выберите ДЗ'
              }
              testId="export-homeworks"
            />
          </div>
        </div>

        {/* CSV / Sheets — segmented control. The previous variant
            rendered two `<Button>`s side by side which read as "two
            separate actions" rather than "one-of-two". The pill bar
            with an inner active pill matches the format-picker style
            used on the SubmissionsListPage filter. */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Куда выгрузить</span>
          <div className="inline-flex items-center rounded-full bg-muted/40 p-0.5">
            <SegmentedOption
              active={target === 'csv'}
              onClick={() => setTarget('csv')}
              icon={<Download className="h-3.5 w-3.5" />}
              label="CSV-файл"
              testId="export-target-csv"
            />
            <SegmentedOption
              active={target === 'google_sheets'}
              onClick={() => setTarget('google_sheets')}
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              label="Google Sheets"
              testId="export-target-google_sheets"
            />
          </div>
        </div>

        {target === 'google_sheets' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[280px] flex-1 space-y-1.5">
                <Label htmlFor="export-spreadsheet">
                  Ссылка или ID Google-таблицы
                </Label>
                <Input
                  id="export-spreadsheet"
                  data-testid="export-spreadsheet-id"
                  placeholder="https://docs.google.com/spreadsheets/d/… или 1AbC…"
                  value={spreadsheetInput}
                  onChange={(e) => setSpreadsheetInput(e.currentTarget.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={onLoadPreview}
                disabled={!spreadsheetInput.trim() || previewMut.isPending}
                data-testid="export-load-preview"
              >
                {previewMut.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {preview ? 'Перезагрузить таблицу' : 'Загрузить таблицу'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Поделитесь таблицей с сервисным аккаунтом PlagLens (доступ на
              редактирование).
            </p>

            {preview && (
              <UniverSpreadsheetPicker
                preview={preview}
                selection={selection}
                onSelectionChange={setSelection}
                paint={paint}
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {hint && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="export-grades-hint"
            >
              {hint}
            </span>
          )}
          {target === 'google_sheets' && (
            <Button
              type="button"
              variant="outline"
              disabled={
                !courseId ||
                homeworkIds.length === 0 ||
                preview === null ||
                selection === null ||
                previewGradesMut.isPending
              }
              onClick={onPaintPreview}
              data-testid="export-grades-preview"
            >
              {previewGradesMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Подставить оценки
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!canExport}
            onClick={() => setSaveOpen(true)}
            data-testid="export-save-binding"
          >
            <Save className="mr-2 h-4 w-4" />
            Сохранить привязку
          </Button>
          <Button
            onClick={onExport}
            disabled={!canExport}
            data-testid="export-grades-submit"
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {target === 'csv' ? 'Скачать оценки' : 'Записать в таблицу'}
          </Button>
        </div>
      </section>

      {/* ---- Saved bindings (auto-sync) — only shown when a course is
              chosen and the user actually has bindings. Renders as flat
              divide-y rows, not a table. */}
      {courseId && gradeBindings.length > 0 && (
        <section className="space-y-3 border-t border-border/60 pt-6">
          <h2 className="text-base font-semibold">Сохранённые привязки</h2>
          <ul
            className="flex flex-col divide-y divide-border/60"
            data-testid="bindings-list"
          >
            {gradeBindings.map((s) => (
              <BindingRow
                key={s.id}
                binding={s}
                onSyncNow={() => onSyncBindingNow(s.id)}
                onDelete={() => onDeleteBinding(s.id)}
                syncing={runSched.isPending}
                deleting={deleteSched.isPending}
              />
            ))}
          </ul>
        </section>
      )}

      {/* ---- Exports history ---- */}
      <section className="space-y-3 border-t border-border/60 pt-6">
        <h2 className="text-base font-semibold">История экспортов</h2>
        {exportsLoading ? (
          <div className="flex items-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : exportItems.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Пока ничего не экспортировали.
          </p>
        ) : (
          <ul
            className="flex flex-col divide-y divide-border/60"
            data-testid="exports-list"
          >
            {exportItems.map((j) => (
              <FlatExportRow
                key={j.id}
                job={j}
                onDownload={onDownload}
                onRetry={(id) => retry.mutate(id)}
                onCancel={(id) => cancel.mutate(id)}
                onDelete={(id) => remove.mutate(id)}
              />
            ))}
          </ul>
        )}
      </section>

      <ExportCreateModal
        opened={otherOpen}
        onClose={() => setOtherOpen(false)}
        defaultKind="course_summary"
        onSubmit={(input) => {
          create.mutate(input, {
            onSuccess: () => {
              notify.success('Экспорт создан, скоро будет готов.');
              setOtherOpen(false);
            },
            onError: (p) => {
              notify.error(
                (p as unknown as Problem).title ||
                  'Не удалось создать экспорт',
              );
            },
          });
        }}
        busy={create.isPending}
      />

      <SaveBindingDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={onSaveBinding}
        busy={createSched.isPending}
      />
    </Page>
  );
}

/** One option inside the CSV / Sheets segmented control. Active state
 *  is a raised inner pill — same pattern as the filter chips on the
 *  submissions list. */
function SegmentedOption({
  active,
  onClick,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// History row — flat document-style, no `<Table>` chrome
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<ExportStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

// Status surfacing: «Готово» is the default for finished exports;
// painting every row with a blue dot for that adds visual noise.
// Only the non-trivial states get a coloured tone.
const STATUS_TONE: Record<ExportStatus, string | null> = {
  queued: 'text-muted-foreground',
  running: 'text-primary',
  completed: null,
  failed: 'text-sev-high',
  cancelled: 'text-sev-mid',
};

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

interface FlatExportRowProps {
  job: ExportJob;
  onDownload?: (id: string) => void;
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function FlatExportRow({
  job,
  onDownload,
  onRetry,
  onCancel,
  onDelete,
}: FlatExportRowProps) {
  const isTerminal =
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'cancelled';
  const isActive = job.status === 'queued' || job.status === 'running';

  const statusTone = STATUS_TONE[job.status];

  return (
    <li
      data-testid={`export-row-${job.id}`}
      className="group flex items-center gap-3 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium text-foreground truncate">
            {job.kind}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {job.format}
          </span>
          {statusTone && (
            <span className={cn('text-xs', statusTone)}>
              {STATUS_LABEL[job.status].toLowerCase()}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {dayjs(job.created_at).format('D MMM HH:mm')}
          {job.error?.title && (
            <span className="ml-2 text-destructive">· {job.error.title}</span>
          )}
        </div>
      </div>
      <span className="hidden sm:inline flex-none text-xs tabular-nums text-muted-foreground w-20 text-right">
        {formatBytes(job.artifact_size_bytes)}
      </span>
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {job.status === 'completed' && onDownload && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Скачать"
            title="Скачать"
            onClick={() => onDownload(job.id)}
            data-testid={`download-${job.id}`}
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        {job.status === 'failed' && onRetry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Повторить"
            title="Повторить"
            onClick={() => onRetry(job.id)}
            data-testid={`retry-${job.id}`}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        {isActive && onCancel && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sev-mid hover:text-sev-mid"
            aria-label="Отменить"
            title="Отменить"
            onClick={() => onCancel(job.id)}
            data-testid={`cancel-${job.id}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {isTerminal && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label="Удалить"
            title="Удалить"
            onClick={() => onDelete(job.id)}
            data-testid={`delete-${job.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Saved-binding helpers + components
// ---------------------------------------------------------------------------

const CRON_PRESETS: { value: string; label: string }[] = [
  { value: '0 6 * * 1', label: 'Каждый понедельник в 06:00 UTC' },
  { value: '0 6 * * *', label: 'Каждый день в 06:00 UTC' },
  { value: '0 18 * * 5', label: 'Каждую пятницу в 18:00 UTC' },
  { value: '0 */6 * * *', label: 'Каждые 6 часов' },
];

function describeCron(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  return preset ? preset.label : cron;
}

function describeBinding(
  scope: Record<string, unknown> | null | undefined,
): string {
  const s = scope ?? {};
  const hwIds = (s.homework_ids ?? []) as string[];
  const single = s.homework_id as string | undefined;
  const count = Array.isArray(hwIds) ? hwIds.length : 0 || (single ? 1 : 0);
  const sheet = s.sheet_title as string | undefined;
  const anchor = (s.anchor_cell as string | undefined) ?? 'A1';
  if (sheet) {
    return `${count} ДЗ → ${sheet}!${anchor}`;
  }
  return `${count} ДЗ`;
}

interface BindingRowProps {
  binding: ScheduledExport;
  onSyncNow: () => void;
  onDelete: () => void;
  syncing: boolean;
  deleting: boolean;
}

function BindingRow({
  binding,
  onSyncNow,
  onDelete,
  syncing,
  deleting,
}: BindingRowProps) {
  const lastRun = binding.last_run_at
    ? dayjs(binding.last_run_at).format('D MMM HH:mm')
    : '—';
  return (
    <li
      data-testid={`binding-row-${binding.id}`}
      className="group flex items-center gap-3 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {describeBinding(binding.scope as Record<string, unknown>)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" />
          {describeCron(binding.cron)} · {binding.format} · последний запуск{' '}
          <span className="tabular-nums">{lastRun}</span>
        </div>
      </div>
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onSyncNow}
          disabled={syncing}
          title="Запустить сейчас"
          data-testid={`binding-sync-${binding.id}`}
        >
          <PlayCircle className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          title="Удалить"
          data-testid={`binding-delete-${binding.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

interface SaveBindingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (cron: string) => void;
  busy: boolean;
}

function SaveBindingDialog({
  open,
  onClose,
  onSave,
  busy,
}: SaveBindingDialogProps) {
  const [preset, setPreset] = useState<string>(CRON_PRESETS[0].value);
  const [custom, setCustom] = useState('');
  const isCustom = preset === '__custom__';
  const effectiveCron = isCustom ? custom.trim() : preset;
  const canSave = effectiveCron.length >= 5 && !busy;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="save-binding-dialog">
        <DialogHeader>
          <DialogTitle>Расписание автосинхронизации</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Текущие настройки (ДЗ, формат, выделенный диапазон в таблице)
            сохраняются как привязка и запускаются по выбранному
            расписанию.
          </p>
          <div className="space-y-2">
            <Label>Когда запускать</Label>
            <div className="space-y-1.5">
              {CRON_PRESETS.map((p) => (
                <label
                  key={p.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="cron-preset"
                    checked={preset === p.value}
                    onChange={() => setPreset(p.value)}
                  />
                  <span className="flex-1 text-sm">{p.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.value}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <input
                  type="radio"
                  name="cron-preset"
                  checked={isCustom}
                  onChange={() => setPreset('__custom__')}
                />
                <span className="flex-1 text-sm">Свой cron</span>
                <Input
                  className="h-7 w-32 font-mono text-xs"
                  placeholder="* * * * *"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.currentTarget.value);
                    setPreset('__custom__');
                  }}
                  data-testid="binding-cron-custom"
                />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            onClick={() => onSave(effectiveCron)}
            disabled={!canSave}
            data-testid="save-binding-submit"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
