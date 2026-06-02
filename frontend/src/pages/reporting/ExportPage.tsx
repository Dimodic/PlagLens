/**
 * /reports — «Экспорт».
 *
 * Primary path: write grades into the course's **linked** Google Sheet
 * with one button. The spreadsheet + tab are bound once in the course
 * settings («Таблица для оценок»), so here the teacher only picks the
 * course + ДЗ and confirms a placement preview (each ДЗ → a column, each
 * student → a row, matched automatically with a manual override for the
 * columns the heuristic isn't sure about). CSV lives in the «…» menu.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useTheme } from 'next-themes';
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
  type PaintCell,
} from '@/components/reporting/UniverSpreadsheetPicker';
import {
  useCancelExport,
  useCreateExport,
  useCreateSheetsLink,
  useDeleteExport,
  useDeleteSheetsLink,
  useDownloadExport,
  useExports,
  useGoogleSheetsLink,
  useGradesMatch,
  useGradesWrite,
  usePreviewSpreadsheet,
  useRetryExport,
  useSetSheetsLink,
  useValidateSheetsLink,
} from '@/hooks/api/useReporting';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation, t, getLocale } from '@/i18n';
import { useAuth } from '@/auth/useAuth';
import type {
  ExportJob,
  ExportStatus,
  GradesMatchResult,
  PreviewSpreadsheet,
} from '@/api/endpoints/reporting';
import type { Problem } from '@/api/types';

function pluralStudents(n: number): string {
  if (getLocale() === 'en') {
    return n === 1 ? t('export_page.student_one') : t('export_page.student_many');
  }
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return t('export_page.student_many');
  if (mod10 === 1) return t('export_page.student_one');
  if (mod10 >= 2 && mod10 <= 4) return t('export_page.student_few');
  return t('export_page.student_many');
}

/** 0-indexed column → spreadsheet letters (0→A, 26→AA). */
function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Accept a full ``…/spreadsheets/d/<id>/edit`` URL or a bare id. */
function parseSpreadsheetId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : t;
}

export default function ExportPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('export_page.title'));
  const notify = useNotifications();
  const { user } = useAuth();
  // Assistants can export but not (re)bind the course's sheet — binding
  // is an owner/co_owner action (enforced server-side too).
  const isAssistant = user?.global_role === 'assistant';

  const [courseId, setCourseId] = useState('');
  const [homeworkIds, setHomeworkIds] = useState<string[]>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  // History is collapsed by default — it's rarely needed and was eating
  // vertical space above the fold on the main export flow.
  const [historyOpen, setHistoryOpen] = useState(false);
  // «Предзаписать» overlay — grades painted into the on-page preview so
  // the teacher can eyeball placement before the real write. Cleared
  // whenever the course / ДЗ selection changes (it'd be stale).
  const [paintCells, setPaintCells] = useState<PaintCell[] | null>(null);
  const [paintSheet, setPaintSheet] = useState<string | null>(null);
  // Bumped on each successful pre-write so the preview remounts and
  // re-bakes the overlay (Univer can't recreate a workbook in place).
  const [paintVersion, setPaintVersion] = useState(0);
  // Bumped after a real write so the on-page preview refetches and shows
  // the freshly-written grades (with their conditional-format colours).
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  // Full pre-write result — reused by «Записать в таблицу» so it doesn't
  // recompute the placement the teacher already saw (no double work).
  const [matchResult, setMatchResult] = useState<GradesMatchResult | null>(null);

  const { data: courses, isLoading: coursesLoading } = useMyCourses();
  const { data: homeworks, isLoading: hwLoading } = useHomeworksForCourse(
    courseId || undefined,
  );
  const { data: link } = useGoogleSheetsLink(courseId || undefined);
  const create = useCreateExport();
  const prematch = useGradesMatch(courseId);

  const courseItems = courses?.data ?? [];
  const homeworkOptions = useMemo(
    () =>
      (homeworks?.data ?? []).map((h) => ({
        id: String(h.id),
        title: h.title,
      })),
    [homeworks?.data],
  );

  const hasLink = !!link?.spreadsheet_id;
  const canWrite = hasLink && homeworkIds.length > 0;

  // Drop a stale pre-write overlay/result when the selection changes.
  useEffect(() => {
    setPaintCells(null);
    setPaintSheet(null);
    setMatchResult(null);
  }, [courseId, homeworkIds]);

  // ---- «Предзаписать»: ask the backend where each grade lands (ФИО →
  // login matching), then paint those exact cells into the preview.
  // Nothing is written to Google here — it's a look-before-you-leap. ----
  const onPrewrite = () => {
    if (!hasLink || homeworkIds.length === 0) return;
    prematch.mutate(
      {
        homework_ids: homeworkIds,
        spreadsheet_id: link!.spreadsheet_id,
        sheet_name: link?.sheet_name,
      },
      {
        onSuccess: (data) => {
          // The backend already matched each task → its column and student
          // → row (per-task into A…J, or a total column), so we just paint
          // the cells it computed.
          const cells: PaintCell[] = data.placements.map((p) => ({
            row: p.row,
            col: p.col,
            value: p.value,
          }));
          if (cells.length === 0) {
            const noCols = data.homeworks.every((h) => h.mode === 'none');
            const msg =
              data.matched_students === 0
                ? t('export_page.prewrite_no_students')
                : noCols
                  ? t('export_page.prewrite_no_columns')
                  : t('export_page.prewrite_no_grades');
            notify.error(msg);
            return; // leave the preview as-is
          }
          const students = new Set(data.placements.map((p) => p.author_id)).size;
          setMatchResult(data); // reused by «Записать в таблицу» — no recompute
          setPaintSheet(data.sheet_name);
          setPaintCells(cells);
          setPaintVersion((v) => v + 1); // force the preview to re-bake
          notify.success(
            t('export_page.prewrite_success', {
              cells: cells.length,
              students,
              word: pluralStudents(students),
            }),
          );
        },
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              t('export_page.prewrite_failed'),
          ),
      },
    );
  };

  // ---- CSV (secondary, lives in the «…» menu) ----
  const onDownloadCsv = () => {
    if (homeworkIds.length === 0) {
      notify.error(t('export_page.select_homework'));
      return;
    }
    create.mutate(
      {
        kind: 'assignment_grades',
        format: 'csv',
        scope: { course_id: courseId, homework_ids: homeworkIds },
      },
      {
        onSuccess: () => notify.success(t('export_page.csv_started')),
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).title || t('export_page.csv_failed'),
          ),
      },
    );
  };

  // ---- History ----
  const { data: exportsData, isLoading: exportsLoading } = useExports(
    {},
    {
      refetchInterval: (q) => {
        const rows: ExportJob[] = q.state.data?.data ?? [];
        return rows.some(
          (j) => j.status === 'queued' || j.status === 'running',
        )
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
      if (typeof window !== 'undefined')
        window.open(r.url, '_blank', 'noopener');
    } catch (p) {
      notify.error(
        (p as unknown as Problem).title || t('export_page.link_failed'),
      );
    }
  };

  return (
    <Page width="regular">
      <PageHeader
        title={t('export_page.title')}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('export_page.more')}
                data-testid="export-page-menu"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onDownloadCsv}
                disabled={homeworkIds.length === 0 || create.isPending}
                data-testid="export-csv"
              >
                <Download className="mr-2 h-4 w-4" />
                {t('export_page.download_csv')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setOtherOpen(true)}
                data-testid="export-other-open"
              >
                {t('export_page.other_report')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <section className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="export-course">{t('export_page.course')}</Label>
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
                    coursesLoading
                      ? t('export_page.loading')
                      : t('export_page.course_placeholder')
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
            <Label>{t('export_page.homeworks')}</Label>
            <HomeworkMultiSelect
              options={homeworkOptions}
              value={homeworkIds}
              onChange={setHomeworkIds}
              disabled={!courseId || hwLoading}
              loading={hwLoading}
              placeholder={
                !courseId
                  ? t('export_page.homeworks_placeholder_no_course')
                  : t('export_page.homeworks_placeholder')
              }
              testId="export-homeworks"
            />
          </div>
        </div>

        {/* Linked sheet — set/edit inline (owner/co_owner). Assistants
            only export, so they don't see the binding editor. */}
        {courseId && !isAssistant && <SheetLinkInline courseId={courseId} />}

        {/* Live preview of the bound sheet — so the teacher SEES exactly
            which table grades land in (read-only; edits here don't touch
            the real sheet). */}
        {courseId && hasLink && (
          <SheetPreview
            spreadsheetId={link!.spreadsheet_id}
            sheetName={link?.sheet_name}
            paintCells={paintCells}
            paintSheet={paintSheet}
            paintVersion={paintVersion}
            reloadKey={previewReloadKey}
          />
        )}

        <div className="flex items-center justify-end gap-3">
          {!canWrite && courseId && (
            <span className="text-xs text-muted-foreground">
              {!hasLink
                ? t('export_page.bind_sheet_first')
                : t('export_page.select_homework')}
            </span>
          )}
          <Button
            variant="outline"
            onClick={onPrewrite}
            disabled={!canWrite || prematch.isPending}
            data-testid="export-prewrite"
            title={t('export_page.prewrite_hint')}
          >
            {prematch.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {t('export_page.prewrite')}
          </Button>
          <Button
            onClick={() => setMappingOpen(true)}
            disabled={!canWrite}
            data-testid="export-grades-submit"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {t('export_page.write_to_sheet')}
          </Button>
        </div>
      </section>

      {/* History — collapsed by default behind a toggle; rarely needed and
          it was taking prime vertical space on the main flow. */}
      <section className="space-y-3 border-t border-border/60 pt-6">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          aria-expanded={historyOpen}
          data-testid="export-history-toggle"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          {historyOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          {t('export_page.history')}
          {exportItems.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {exportItems.length}
            </span>
          )}
        </button>
        {historyOpen &&
          (exportsLoading ? (
            <div className="flex items-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : exportItems.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {t('export_page.history_empty')}
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
          ))}
      </section>

      {courseId && hasLink && (
        <MappingDialog
          open={mappingOpen}
          onClose={() => setMappingOpen(false)}
          courseId={courseId}
          spreadsheetId={link!.spreadsheet_id}
          sheetName={link?.sheet_name}
          homeworkIds={homeworkIds}
          prefetched={matchResult}
          onWritten={() => {
            // Clear the «Предзаписать» overlay and force the preview to
            // re-read the sheet so the just-written grades (and their
            // colours) actually show up.
            setPaintCells(null);
            setPaintSheet(null);
            setPreviewReloadKey((k) => k + 1);
          }}
        />
      )}

      <ExportCreateModal
        opened={otherOpen}
        onClose={() => setOtherOpen(false)}
        defaultKind="course_summary"
        onSubmit={(input) => {
          create.mutate(input, {
            onSuccess: () => {
              notify.success(t('export_page.export_created'));
              setOtherOpen(false);
            },
            onError: (p) => {
              notify.error(
                (p as unknown as Problem).title ||
                  t('export_page.export_create_failed'),
              );
            },
          });
        }}
        busy={create.isPending}
      />
    </Page>
  );
}

/* ----------------------------------------------------------------- */
/* Live spreadsheet preview (Univer) — read-only view of the target   */
/* ----------------------------------------------------------------- */

function SheetPreview({
  spreadsheetId,
  sheetName,
  paintCells,
  paintSheet,
  paintVersion = 0,
  reloadKey = 0,
}: {
  spreadsheetId: string;
  sheetName?: string;
  paintCells?: PaintCell[] | null;
  paintSheet?: string | null;
  paintVersion?: number;
  /** Bumped after a real write so the preview refetches and shows the
   *  freshly-written grades (and the sheet's own colours for them). */
  reloadKey?: number;
}) {
  const { t } = useTranslation();
  const preview = usePreviewSpreadsheet();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<PreviewSpreadsheet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  // Reset when the target sheet/tab changes (course switch / re-bind).
  useEffect(() => {
    setData(null);
    setErr(null);
  }, [spreadsheetId, sheetName]);

  // A grade write just finished — drop the cached preview so the load
  // effect refetches it. The re-read reflects the new values and the
  // colours the sheet's own conditional formatting applies to them, which
  // is what «цвет не меняется в превью» was about.
  useEffect(() => {
    if (reloadKey > 0) {
      setData(null);
      setErr(null);
    }
  }, [reloadKey]);

  // A pre-write paint just arrived — make sure the table is visible so
  // the teacher actually sees the highlighted cells.
  useEffect(() => {
    if (paintCells && paintCells.length > 0) setOpen(true);
  }, [paintCells]);

  // Load the preview the first time the panel is open for this sheet.
  // A roomy window (300×140) so a full class roster AND every ДЗ block
  // (ДЗ-1…ДЗ-10 run well past column 40) are in view — otherwise the
  // grid shows a sea of empty cells past the fetched edge.
  useEffect(() => {
    if (!open || data || !spreadsheetId || preview.isPending) return;
    setErr(null);
    preview.mutate(
      { spreadsheetId, max_rows: 300, max_cols: 140, sheet_name: sheetName },
      {
        onSuccess: setData,
        onError: (p) =>
          setErr(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              t('export_page.preview_load_failed'),
          ),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spreadsheetId, data]);

  return (
    <div className="space-y-2" data-testid="export-sheet-preview">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-primary hover:underline"
        data-testid="export-preview-toggle"
      >
        {open ? t('export_page.preview_hide') : t('export_page.preview_show')}
      </button>

      {open &&
        (preview.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('export_page.preview_loading')}
          </div>
        ) : err ? (
          <p className="py-3 text-sm text-muted-foreground">
            {t('export_page.preview_error', { error: err })}
          </p>
        ) : data ? (
          <UniverSpreadsheetPicker
            // Remount on theme flip AND on each pre-write — Univer bakes
            // palette + cell overlay into the workbook and can't swap
            // either in place (recreating a workbook with the same unit
            // id throws), so a keyed re-init is the reliable path.
            key={`${resolvedTheme ?? 'light'}-${paintVersion}-${reloadKey}`}
            preview={data}
            selection={null}
            onSelectionChange={() => {}}
            paintCells={paintCells}
            paintSheet={paintSheet}
            height={420}
          />
        ) : null)}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Inline per-course sheet binding (lives here, where it's used)      */
/* ----------------------------------------------------------------- */

function SheetLinkInline({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const { data: link, isLoading } = useGoogleSheetsLink(courseId);
  const create = useCreateSheetsLink(courseId);
  const update = useSetSheetsLink(courseId);
  const remove = useDeleteSheetsLink(courseId);
  const validate = useValidateSheetsLink(courseId);

  const [editing, setEditing] = useState(false);
  const [sheetInput, setSheetInput] = useState('');
  const [tab, setTab] = useState('');

  const hasLink = !!link?.spreadsheet_id;
  useEffect(() => {
    if (link) {
      setSheetInput(link.spreadsheet_id ?? '');
      setTab(link.sheet_name ?? '');
    }
  }, [link?.spreadsheet_id, link?.sheet_name]);

  const busy = create.isPending || update.isPending || remove.isPending;
  const showEditor = editing || !hasLink;

  const onSave = async () => {
    const sid = parseSpreadsheetId(sheetInput);
    if (!sid) {
      notify.error(t('export_page.sheet_id_required'));
      return;
    }
    try {
      if (hasLink) {
        await update.mutateAsync({
          spreadsheet_id: sid,
          sheet_name: tab || undefined,
        });
      } else {
        await create.mutateAsync({
          spreadsheet_id: sid,
          sheet_name: tab || t('export_page.default_sheet_tab'),
        });
      }
      notify.success(t('export_page.sheet_linked'));
      setEditing(false);
    } catch (e) {
      notify.error(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || t('export_page.sheet_save_failed'),
      );
    }
  };

  const onValidate = async () => {
    try {
      const r = await validate.mutateAsync();
      if (r.ok) notify.success(t('export_page.access_ok'));
      else notify.error(r.detail || t('export_page.access_denied'));
    } catch {
      notify.error(t('export_page.access_check_failed'));
    }
  };

  const onRemove = async () => {
    if (!confirm(t('export_page.unlink_confirm'))) return;
    try {
      await remove.mutateAsync();
      setEditing(false);
      setSheetInput('');
      setTab('');
      notify.success(t('export_page.sheet_unlinked'));
    } catch {
      notify.error(t('export_page.unlink_failed'));
    }
  };

  if (isLoading) return null;

  return (
    <div
      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
      data-testid="export-sheet-link"
    >
      {!showEditor ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4 flex-none" />
          <span className="truncate">
            {t('export_page.sheet_label')}{' '}
            <span className="font-medium text-foreground">
              {link?.sheet_name || t('export_page.default_sheet_tab')}
            </span>
          </span>
          <button
            type="button"
            className="ml-auto flex-none text-xs text-primary hover:underline"
            onClick={() => setEditing(true)}
            data-testid="export-sheet-edit"
          >
            {t('export_page.edit')}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            {hasLink ? (
              <FileSpreadsheet className="h-4 w-4 flex-none" />
            ) : (
              <AlertTriangle className="h-4 w-4 flex-none text-sev-mid" />
            )}
            <span className="text-xs">
              {hasLink
                ? t('export_page.sheet_edit_title')
                : t('export_page.sheet_unlinked_prompt')}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="export-sheet-id" className="text-xs">
                {t('export_page.sheet_id_label')}
              </Label>
              <Input
                id="export-sheet-id"
                data-testid="export-sheet-id"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetInput}
                onChange={(e) => setSheetInput(e.currentTarget.value)}
              />
            </div>
            <div className="w-[140px] space-y-1">
              <Label htmlFor="export-sheet-tab" className="text-xs">
                {t('export_page.sheet_tab_label')}
              </Label>
              <Input
                id="export-sheet-tab"
                data-testid="export-sheet-tab"
                placeholder={t('export_page.default_sheet_tab')}
                value={tab}
                onChange={(e) => setTab(e.currentTarget.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('export_page.service_account_hint')}
          </p>
          <div className="flex items-center gap-2">
            {hasLink && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onRemove}
                disabled={busy}
                data-testid="export-sheet-remove"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('export_page.unlink')}
              </Button>
            )}
            {hasLink && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onValidate}
                disabled={validate.isPending}
                data-testid="export-sheet-validate"
              >
                {validate.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t('export_page.validate')}
              </Button>
            )}
            <div className="flex-1" />
            {hasLink && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setSheetInput(link?.spreadsheet_id ?? '');
                  setTab(link?.sheet_name ?? '');
                }}
                disabled={busy}
              >
                {t('common.cancel')}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={!sheetInput.trim() || busy}
              data-testid="export-sheet-save"
            >
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {hasLink ? t('common.save') : t('export_page.bind')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Mapping preview + write dialog                                     */
/* ----------------------------------------------------------------- */

interface MappingDialogProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  spreadsheetId: string;
  sheetName?: string;
  homeworkIds: string[];
  /** Result already computed by «Предзаписать» — reused as-is so the
   *  dialog doesn't recompute the same placement. */
  prefetched?: GradesMatchResult | null;
  /** Fired after a successful write so the parent can refresh the preview. */
  onWritten?: () => void;
}

function MappingDialog({
  open,
  onClose,
  courseId,
  spreadsheetId,
  sheetName,
  homeworkIds,
  prefetched,
  onWritten,
}: MappingDialogProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const match = useGradesMatch(courseId);
  const write = useGradesWrite(courseId);
  const [result, setResult] = useState<GradesMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On open: reuse the pre-write result if we have one (no double work);
  // only compute here when the teacher skipped «Предзаписать».
  useEffect(() => {
    if (!open || homeworkIds.length === 0) return;
    setError(null);
    if (prefetched) {
      setResult(prefetched);
      return;
    }
    setResult(null);
    match.mutate(
      {
        homework_ids: homeworkIds,
        spreadsheet_id: spreadsheetId,
        sheet_name: sheetName,
      },
      {
        onSuccess: setResult,
        onError: (p) =>
          setError(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              t('export_page.match_failed'),
          ),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plannedCells = result?.placements.length ?? 0;

  const onConfirm = () => {
    if (!result || plannedCells === 0) return;
    write.mutate(
      {
        homework_ids: homeworkIds,
        spreadsheet_id: spreadsheetId,
        sheet_name: result.sheet_name,
        // Write exactly the cells already computed/previewed — the server
        // skips its own recompute when these are present.
        cells: result.placements.map((pl) => ({
          row: pl.row,
          col: pl.col,
          value: pl.value,
        })),
      },
      {
        onSuccess: (r) => {
          notify.success(
            t('export_page.write_success', {
              cells: r.written_cells,
              students: r.students_written,
              word: pluralStudents(r.students_written),
            }),
          );
          onWritten?.();
          onClose();
        },
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              t('export_page.write_failed'),
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="mapping-dialog">
        <DialogHeader>
          <DialogTitle>{t('export_page.mapping_title')}</DialogTitle>
          {result && (
            <p className="truncate text-sm text-muted-foreground">
              {t('export_page.mapping_sheet', { sheet: result.sheet_name })}
            </p>
          )}
        </DialogHeader>

        {match.isPending ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('export_page.mapping_loading')}
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-sev-high">{error}</p>
        ) : result ? (
          <div className="space-y-4">
            {/* Per-ДЗ placement plan (computed, read-only) */}
            <div className="space-y-1.5" data-testid="mapping-plan">
              {result.homeworks.map((h) => (
                <PlanRow key={h.homework_id} plan={h} />
              ))}
            </div>

            {/* Student match summary */}
            <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t('export_page.students_summary', {
                matched: result.matched_students,
                total: result.total_students,
              })}
              {result.unmatched_students.length > 0 && (
                <>
                  {' '}
                  {t('export_page.students_unmatched')}{' '}
                  <span className="text-sev-mid">
                    {result.unmatched_students.slice(0, 5).join(', ')}
                    {result.unmatched_students.length > 5
                      ? t('export_page.students_unmatched_more', {
                          count: result.unmatched_students.length - 5,
                        })
                      : ''}
                  </span>
                  .
                </>
              )}
              {plannedCells > result.matched_students && (
                <div className="mt-1 text-muted-foreground/80">
                  {t('export_page.cells_per_task', { cells: plannedCells })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={write.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!result || plannedCells === 0 || write.isPending}
            data-testid="mapping-confirm"
          >
            {write.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('export_page.write_count', { count: plannedCells })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One homework's computed placement — where its grades will land. */
function PlanRow({ plan }: { plan: GradesMatchResult['homeworks'][number] }) {
  const { t } = useTranslation();
  const cols = plan.columns;
  let detail: string;
  let tone = 'text-muted-foreground';
  if (plan.mode === 'none' || cols.length === 0) {
    detail = t('export_page.plan_unplaced');
    tone = 'text-sev-mid';
  } else if (plan.mode === 'tasks') {
    const a = colLetter(cols[0]);
    const b = colLetter(cols[cols.length - 1]);
    detail = t('export_page.plan_tasks', { cols: a === b ? a : `${a}–${b}` });
  } else {
    detail = t('export_page.plan_total', { cols: colLetter(cols[0]) });
  }
  return (
    <div
      className="flex items-center gap-3 text-sm"
      data-testid={`mapping-plan-${plan.homework_id}`}
    >
      <div className="min-w-0 flex-1 truncate">
        {plan.title}
        {plan.number != null && (
          <span className="ml-1 text-xs text-muted-foreground">
            {t('export_page.plan_number', { number: plan.number })}
          </span>
        )}
      </div>
      <div className={cn('flex-none text-right text-xs', tone)}>
        {detail}
        {plan.placed_cells > 0 && (
          <span className="text-muted-foreground">
            {' '}
            · {t('export_page.plan_placed', { count: plan.placed_cells })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* History row                                                        */
/* ----------------------------------------------------------------- */

const STATUS_LABEL_KEY: Record<ExportStatus, string> = {
  queued: 'export_page.status_queued',
  running: 'export_page.status_running',
  completed: 'export_page.status_completed',
  failed: 'export_page.status_failed',
  cancelled: 'export_page.status_cancelled',
};

const STATUS_TONE: Record<ExportStatus, string | null> = {
  queued: 'text-muted-foreground',
  running: 'text-primary',
  completed: null,
  failed: 'text-sev-high',
  cancelled: 'text-sev-mid',
};

// Human, teacher-facing names for each export kind — the raw enum
// («assignment_grades» / «GOOGLE_SHEETS») read as developer noise.
const KIND_LABEL_KEY: Record<string, string> = {
  assignment_grades: 'export_page.kind_assignment_grades',
  course_summary: 'export_page.kind_course_summary',
  plagiarism_report: 'export_page.kind_plagiarism_report',
  ai_analysis_summary: 'export_page.kind_ai_summary',
  audit_log: 'export_page.kind_audit_log',
  tenant_usage: 'export_page.kind_tenant_usage',
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
  const { t } = useTranslation();
  const isTerminal =
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'cancelled';
  const isActive = job.status === 'queued' || job.status === 'running';
  const statusTone = STATUS_TONE[job.status];
  // Google-Sheets grade writes carry their counts in options — surface them
  // so the row says what was actually done, not just the export type.
  const opts = job.options ?? {};
  const gradeCount =
    typeof opts.written_cells === 'number' ? opts.written_cells : null;
  const studentCount =
    typeof opts.students_written === 'number' ? opts.students_written : null;

  return (
    <li
      data-testid={`export-row-${job.id}`}
      className="group flex items-center gap-3 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="truncate font-medium text-foreground">
            {KIND_LABEL_KEY[job.kind] ? t(KIND_LABEL_KEY[job.kind]) : job.kind}
          </span>
          <span className="text-xs text-muted-foreground">
            {job.format === 'google_sheets'
              ? t('export_page.format_google_sheets')
              : job.format.toUpperCase()}
          </span>
          {statusTone && (
            <span className={cn('text-xs', statusTone)}>
              {t(STATUS_LABEL_KEY[job.status]).toLowerCase()}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {gradeCount != null && (
            <span className="text-foreground/70">
              {t('export_page.history_grades', { count: gradeCount })}
              {studentCount != null &&
                ` · ${t('export_page.history_students', { count: studentCount })}`}
              {' · '}
            </span>
          )}
          {dayjs(job.created_at).format('D MMM HH:mm')}
          {job.error?.title && (
            <span className="ml-2 text-destructive">· {job.error.title}</span>
          )}
        </div>
      </div>
      <span className="hidden w-20 flex-none text-right text-xs tabular-nums text-muted-foreground sm:inline">
        {/* No artifact (e.g. a Google-Sheets write) → leave blank, not «—». */}
        {job.artifact_size_bytes != null
          ? formatBytes(job.artifact_size_bytes)
          : ''}
      </span>
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {job.status === 'completed' &&
          job.artifact_size_bytes != null &&
          onDownload && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('export_page.download')}
            title={t('export_page.download')}
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
            aria-label={t('export_page.retry')}
            title={t('export_page.retry')}
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
            aria-label={t('export_page.cancel')}
            title={t('export_page.cancel')}
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
            aria-label={t('common.delete')}
            title={t('common.delete')}
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
