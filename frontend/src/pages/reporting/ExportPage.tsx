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
  Download,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  RefreshCw,
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
  useRetryExport,
  useSetSheetsLink,
  useValidateSheetsLink,
} from '@/hooks/api/useReporting';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type {
  ExportJob,
  ExportStatus,
  GradesMatchColumn,
  GradesMatchResult,
} from '@/api/endpoints/reporting';
import type { Problem } from '@/api/types';

function pluralStudents(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'студентов';
  if (mod10 === 1) return 'студент';
  if (mod10 >= 2 && mod10 <= 4) return 'студента';
  return 'студентов';
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

const SKIP = '__skip__';

/** Accept a full ``…/spreadsheets/d/<id>/edit`` URL or a bare id. */
function parseSpreadsheetId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : t;
}

export default function ExportPage() {
  useDocumentTitle('Экспорт');
  const notify = useNotifications();

  const [courseId, setCourseId] = useState('');
  const [homeworkIds, setHomeworkIds] = useState<string[]>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  const { data: courses, isLoading: coursesLoading } = useMyCourses();
  const { data: homeworks, isLoading: hwLoading } = useHomeworksForCourse(
    courseId || undefined,
  );
  const { data: link } = useGoogleSheetsLink(courseId || undefined);
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

  const hasLink = !!link?.spreadsheet_id;
  const canWrite = hasLink && homeworkIds.length > 0;

  // ---- CSV (secondary, lives in the «…» menu) ----
  const onDownloadCsv = () => {
    if (homeworkIds.length === 0) {
      notify.error('Выберите хотя бы одно ДЗ');
      return;
    }
    create.mutate(
      {
        kind: 'assignment_grades',
        format: 'csv',
        scope: { course_id: courseId, homework_ids: homeworkIds },
      },
      {
        onSuccess: () =>
          notify.success('CSV готовится — появится в истории ниже'),
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).title || 'Не удалось создать CSV',
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
        (p as unknown as Problem).title || 'Не удалось получить ссылку',
      );
    }
  };

  return (
    <Page width="regular">
      <PageHeader
        title="Экспорт"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ещё"
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
                Скачать CSV
              </DropdownMenuItem>
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
                  placeholder={coursesLoading ? 'Загрузка…' : 'Выберите курс'}
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
              placeholder={!courseId ? 'Сначала выберите курс' : 'Выберите ДЗ'}
              testId="export-homeworks"
            />
          </div>
        </div>

        {/* Linked sheet — set/edit inline, right where it's used. */}
        {courseId && <SheetLinkInline courseId={courseId} />}

        <div className="flex items-center justify-end gap-3">
          {!canWrite && courseId && (
            <span className="text-xs text-muted-foreground">
              {!hasLink
                ? 'Сначала привяжите таблицу в настройках курса'
                : 'Выберите хотя бы одно ДЗ'}
            </span>
          )}
          <Button
            onClick={() => setMappingOpen(true)}
            disabled={!canWrite}
            data-testid="export-grades-submit"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Записать в таблицу
          </Button>
        </div>
      </section>

      {/* History */}
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

      {courseId && hasLink && (
        <MappingDialog
          open={mappingOpen}
          onClose={() => setMappingOpen(false)}
          courseId={courseId}
          spreadsheetId={link!.spreadsheet_id}
          sheetName={link?.sheet_name}
          homeworkIds={homeworkIds}
        />
      )}

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
    </Page>
  );
}

/* ----------------------------------------------------------------- */
/* Inline per-course sheet binding (lives here, where it's used)      */
/* ----------------------------------------------------------------- */

function SheetLinkInline({ courseId }: { courseId: string }) {
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
      notify.error('Укажите ссылку или ID Google-таблицы');
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
          sheet_name: tab || 'Оценки',
        });
      }
      notify.success('Таблица привязана к курсу');
      setEditing(false);
    } catch (e) {
      notify.error(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Не удалось сохранить',
      );
    }
  };

  const onValidate = async () => {
    try {
      const r = await validate.mutateAsync();
      if (r.ok) notify.success('Доступ к таблице есть');
      else notify.error(r.detail || 'Нет доступа к таблице');
    } catch {
      notify.error('Не удалось проверить доступ');
    }
  };

  const onRemove = async () => {
    if (!confirm('Отвязать таблицу от курса?')) return;
    try {
      await remove.mutateAsync();
      setEditing(false);
      setSheetInput('');
      setTab('');
      notify.success('Таблица отвязана');
    } catch {
      notify.error('Не удалось отвязать');
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
            Таблица курса · лист{' '}
            <span className="font-medium text-foreground">
              {link?.sheet_name || 'Оценки'}
            </span>
          </span>
          <button
            type="button"
            className="ml-auto flex-none text-xs text-primary hover:underline"
            onClick={() => setEditing(true)}
            data-testid="export-sheet-edit"
          >
            изменить
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
                ? 'Изменить таблицу курса'
                : 'Google-таблица для оценок не привязана — вставьте ссылку:'}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="export-sheet-id" className="text-xs">
                Ссылка или ID таблицы
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
                Лист
              </Label>
              <Input
                id="export-sheet-tab"
                data-testid="export-sheet-tab"
                placeholder="Оценки"
                value={tab}
                onChange={(e) => setTab(e.currentTarget.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Поделитесь таблицей с сервисным аккаунтом PlagLens (на
            редактирование).
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
                Отвязать
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
                Проверить
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
                Отмена
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
              {hasLink ? 'Сохранить' : 'Привязать'}
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
}

function MappingDialog({
  open,
  onClose,
  courseId,
  spreadsheetId,
  sheetName,
  homeworkIds,
}: MappingDialogProps) {
  const notify = useNotifications();
  const match = useGradesMatch(courseId);
  const write = useGradesWrite(courseId);
  const [result, setResult] = useState<GradesMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // homework_id → selected column index as a string, or SKIP.
  const [cols, setCols] = useState<Record<string, string>>({});

  // (Re)load the proposed mapping each time the dialog opens.
  useEffect(() => {
    if (!open || homeworkIds.length === 0) return;
    setResult(null);
    setError(null);
    match.mutate(
      {
        homework_ids: homeworkIds,
        spreadsheet_id: spreadsheetId,
        sheet_name: sheetName,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          const init: Record<string, string> = {};
          for (const c of data.columns) {
            init[c.homework_id] =
              c.column_index != null ? String(c.column_index) : SKIP;
          }
          setCols(init);
        },
        onError: (p) =>
          setError(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              'Не удалось построить сопоставление',
          ),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const headerOptions = useMemo(() => {
    if (!result) return [] as { value: string; label: string }[];
    return result.header.map((text, i) => ({
      value: String(i),
      label:
        text != null && String(text).trim() !== ''
          ? `${colLetter(i)} · ${String(text)}`
          : `Колонка ${colLetter(i)}`,
    }));
  }, [result]);

  const matchedStudents = result
    ? result.students.filter((s) => s.row_index != null)
    : [];
  const unmatchedStudents = result
    ? result.students.filter((s) => s.row_index == null)
    : [];

  // How many cells would actually be written: matched student × chosen
  // column × a non-null grade.
  const plannedCells = useMemo(() => {
    if (!result) return 0;
    let n = 0;
    for (const s of matchedStudents) {
      for (const c of result.columns) {
        const sel = cols[c.homework_id];
        if (!sel || sel === SKIP) continue;
        if (s.values[c.homework_id] != null) n += 1;
      }
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, cols]);

  const onConfirm = () => {
    if (!result) return;
    const column_map: Record<string, number> = {};
    for (const c of result.columns) {
      const sel = cols[c.homework_id];
      if (sel && sel !== SKIP) column_map[c.homework_id] = Number(sel);
    }
    const row_map: Record<string, number> = {};
    for (const s of matchedStudents) row_map[s.author_id] = s.row_index as number;
    if (Object.keys(column_map).length === 0) {
      notify.error('Не выбрана ни одна колонка для записи');
      return;
    }
    write.mutate(
      {
        homework_ids: homeworkIds,
        spreadsheet_id: spreadsheetId,
        sheet_name: result.sheet_name,
        column_map,
        row_map,
      },
      {
        onSuccess: (r) => {
          notify.success(
            `Записано ${r.written_cells} оценок · ${r.students_written} ${pluralStudents(
              r.students_written,
            )}`,
          );
          onClose();
        },
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              'Не удалось записать в таблицу',
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="mapping-dialog">
        <DialogHeader>
          <DialogTitle>Запись оценок в таблицу</DialogTitle>
          {result && (
            <p className="truncate text-sm text-muted-foreground">
              Лист «{result.sheet_name}»
            </p>
          )}
        </DialogHeader>

        {match.isPending ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Читаю таблицу и сопоставляю…
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-sev-high">{error}</p>
        ) : result ? (
          <div className="space-y-4">
            {/* Per-ДЗ column choice */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Куда писать каждое ДЗ (колонка определяется по номеру —
                поправьте, если не угадалось):
              </p>
              <div className="space-y-1.5" data-testid="mapping-columns">
                {result.columns.map((c) => (
                  <ColumnRow
                    key={c.homework_id}
                    col={c}
                    value={cols[c.homework_id] ?? SKIP}
                    options={headerOptions}
                    onChange={(v) =>
                      setCols((prev) => ({ ...prev, [c.homework_id]: v }))
                    }
                  />
                ))}
              </div>
            </div>

            {/* Student match summary */}
            <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Студенты: сопоставлено{' '}
              <span className="font-medium text-foreground">
                {matchedStudents.length}
              </span>{' '}
              из {result.students.length}.
              {unmatchedStudents.length > 0 && (
                <>
                  {' '}
                  Не нашлись в столбце имён:{' '}
                  <span className="text-sev-mid">
                    {unmatchedStudents
                      .slice(0, 5)
                      .map((s) => s.name)
                      .join(', ')}
                    {unmatchedStudents.length > 5
                      ? ` и ещё ${unmatchedStudents.length - 5}`
                      : ''}
                  </span>
                  .
                </>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={write.isPending}>
            Отмена
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!result || plannedCells === 0 || write.isPending}
            data-testid="mapping-confirm"
          >
            {write.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Записать {plannedCells} оценок
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnRow({
  col,
  value,
  options,
  onChange,
}: {
  col: GradesMatchColumn;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const unsure = col.source === 'none';
  return (
    <div
      className="flex items-center gap-3"
      data-testid={`mapping-col-${col.homework_id}`}
    >
      <div className="min-w-0 flex-1 truncate text-sm">
        {col.title}
        {col.number != null && (
          <span className="ml-1 text-xs text-muted-foreground">
            (№{col.number})
          </span>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            'h-8 w-[200px]',
            unsure && value === SKIP && 'border-sev-mid/60',
          )}
        >
          <SelectValue placeholder="— не писать" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SKIP}>— не писать</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* History row                                                        */
/* ----------------------------------------------------------------- */

const STATUS_LABEL: Record<ExportStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

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
          <span className="truncate font-medium text-foreground">
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
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {dayjs(job.created_at).format('D MMM HH:mm')}
          {job.error?.title && (
            <span className="ml-2 text-destructive">· {job.error.title}</span>
          )}
        </div>
      </div>
      <span className="hidden w-20 flex-none text-right text-xs tabular-nums text-muted-foreground sm:inline">
        {formatBytes(job.artifact_size_bytes)}
      </span>
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
