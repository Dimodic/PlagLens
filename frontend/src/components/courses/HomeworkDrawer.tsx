/**
 * HomeworkDrawer — side-sheet for viewing and editing a homework.
 *
 * Triggered by the settings-icon on a homework row on the course page
 * (clicking the row body itself just expands the inline assignments
 * list — see CourseDetailPage). The drawer keeps the page in view as a
 * dimmed backdrop, so the teacher doesn't lose their place when tweaking
 * a single ДЗ.
 *
 * View mode (default): compact metadata, aggregated submission stats
 * across all assignments in this homework, and the markdown description.
 *
 * Edit mode (course owner only, toggled via «Редактировать»): inline
 * inputs for title / deadline / description. Status changes are
 * shortcut-buttoned to «Архивировать / Восстановить».
 *
 * Aggregate stats: fanned-out per-assignment ``aggregate-stats`` queries
 * collapsed client-side. Cheap for typical homework sizes (≤30 tasks).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MarkdownEditor } from '@/components/forms/MarkdownEditor';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  homeworkKeys,
  useDeleteHomework,
  useUpdateHomework,
} from '@/hooks/api/useHomeworks';
import { submissionsApi } from '@/api/endpoints/submissions';
import { submissionKeys } from '@/hooks/api/useSubmissions';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDateTime } from '@/utils/formatters';
import { cn } from '@/components/ui/utils';
import type {
  AssignmentAggregateStats,
} from '@/api/endpoints/submissions';
import type {
  AssignmentBrief,
} from '@/api/endpoints/assignments';
import type { Homework } from '@/api/endpoints/homeworks';
import type { Problem } from '@/api/types';

interface HomeworkDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The full homework row from the list query (already has title /
   *  description / due_at / status — no need to re-fetch). */
  homework: Homework | null;
  /** Pre-filtered assignments that belong to this homework — the parent
   *  has them in memory already; passing avoids a duplicate fetch. */
  assignments: AssignmentBrief[];
  /** Course-staff capability flag — only owners see edit / delete. */
  canManage: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ``new Date(value).toISOString()`` but tolerant of empties. */
function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO 8601 → ``yyyy-MM-ddThh:mm`` for a native datetime-local input. */
function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local expects no timezone marker; build it from local parts.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

interface AggregatedStats {
  assignments: number;
  submissions: number;
  students_submitted_max: number;
  graded: number;
  late: number;
  average_score: number | null;
  loaded: boolean;
}

function aggregate(
  rows: AssignmentAggregateStats[],
  total: number,
): AggregatedStats {
  if (rows.length === 0) {
    return {
      assignments: total,
      submissions: 0,
      students_submitted_max: 0,
      graded: 0,
      late: 0,
      average_score: null,
      loaded: total === 0,
    };
  }
  const submissions = rows.reduce((s, r) => s + r.submissions_count, 0);
  const graded = rows.reduce((s, r) => s + r.graded_count, 0);
  const late = rows.reduce((s, r) => s + r.late_count, 0);
  // Unique students is server-state per-assignment — without a real
  // join we can only show the max (largest individual assignment's
  // submitter count) as a lower bound on "how many people are in this
  // homework". Mark as "~" in the UI.
  const submitters_max = rows.reduce(
    (m, r) => Math.max(m, r.students_submitted),
    0,
  );
  const weightedScoreNum = rows.reduce(
    (s, r) => s + (r.average_score ?? 0) * r.graded_count,
    0,
  );
  const avg = graded > 0 ? weightedScoreNum / graded : null;
  return {
    assignments: total,
    submissions,
    students_submitted_max: submitters_max,
    graded,
    late,
    average_score: avg,
    loaded: true,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomeworkDrawer({
  open,
  onClose,
  homework,
  assignments,
  canManage,
}: HomeworkDrawerProps) {
  const notify = useNotifications();
  const qc = useQueryClient();
  const update = useUpdateHomework(homework?.id ?? '');
  const remove = useDeleteHomework(homework?.id ?? '');

  // ---------- edit-form state ----------
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState(''); // datetime-local input
  // Re-hydrate from the homework whenever a different one is opened.
  useEffect(() => {
    if (!homework) return;
    setTitle(homework.title);
    setDescription(homework.description ?? '');
    setDueAt(toLocalDateTimeInput(homework.due_at));
    setEditing(false);
  }, [homework?.id, homework]);

  // ---------- aggregate stats across assignments ----------
  // Lazy: only fire the queries when the drawer is actually open — no
  // need to spam aggregate-stats just because the homework list mounted.
  const statsQueries = useQueries({
    queries: assignments.map((a) => ({
      queryKey: [...submissionKeys.all, 'assignment-aggregate-stats', a.id],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        submissionsApi.assignmentAggregateStats(a.id, signal),
      enabled: open && !!homework,
    })),
  });
  const statsRows: AssignmentAggregateStats[] = statsQueries
    .map((q) => q.data)
    .filter((d): d is AssignmentAggregateStats => !!d);
  const statsLoading = open && statsQueries.some((q) => q.isPending);
  const stats = useMemo(
    () => aggregate(statsRows, assignments.length),
    [statsRows, assignments.length],
  );

  // ---------- mutations ----------
  const onSave = () => {
    if (!homework) return;
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      notify.error('Название слишком короткое');
      return;
    }
    update.mutate(
      {
        title: trimmed,
        description: description.trim() || null,
        due_at: fromLocalDateTimeInput(dueAt),
      },
      {
        onSuccess: () => {
          notify.success('ДЗ сохранено');
          setEditing(false);
          void qc.invalidateQueries({ queryKey: homeworkKeys.all });
        },
        onError: (p) => {
          notify.error(
            (p as unknown as Problem).title || 'Не удалось сохранить',
          );
        },
      },
    );
  };

  const onToggleArchive = () => {
    if (!homework) return;
    const nextStatus = homework.status === 'archived' ? 'published' : 'archived';
    update.mutate(
      { status: nextStatus },
      {
        onSuccess: () => {
          notify.success(
            nextStatus === 'archived' ? 'ДЗ в архиве' : 'ДЗ восстановлено',
          );
          void qc.invalidateQueries({ queryKey: homeworkKeys.all });
        },
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).title ||
              'Не удалось сменить статус',
          ),
      },
    );
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const onDelete = () => {
    if (!homework) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        notify.success('ДЗ удалено');
        setConfirmDelete(false);
        onClose();
      },
      onError: (p) =>
        notify.error(
          (p as unknown as Problem).title || 'Не удалось удалить',
        ),
    });
  };

  if (!homework) return null;

  const isArchived = homework.status === 'archived';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
        data-testid="homework-drawer"
      >
        <SheetHeader className="border-b border-border/50 pr-12">
          <SheetTitle className="flex items-start gap-2">
            {editing ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                data-testid="hw-drawer-title"
                placeholder="Название ДЗ"
                className="text-base font-semibold"
              />
            ) : (
              <span className="truncate text-base font-semibold">
                {homework.title}
              </span>
            )}
          </SheetTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isArchived && (
              <Badge variant="outline" className="font-normal">
                в архиве
              </Badge>
            )}
            <span>{stats.assignments} заданий</span>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {/* ---- Stats ---- */}
          <section className="space-y-2">
            <SectionLabel>Статистика</SectionLabel>
            {stats.assignments === 0 ? (
              <p className="text-sm text-muted-foreground">
                В этом ДЗ ещё нет заданий.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <StatCell
                  label="Сдач всего"
                  value={statsLoading && !stats.loaded ? '…' : stats.submissions}
                />
                <StatCell
                  label="Сдавали (≈ людей)"
                  value={
                    statsLoading && !stats.loaded
                      ? '…'
                      : `≥ ${stats.students_submitted_max}`
                  }
                />
                <StatCell
                  label="Оценено"
                  value={statsLoading && !stats.loaded ? '…' : stats.graded}
                />
                <StatCell
                  label="Опоздали"
                  value={statsLoading && !stats.loaded ? '…' : stats.late}
                />
                <StatCell
                  label="Средний балл"
                  value={
                    statsLoading && !stats.loaded
                      ? '…'
                      : stats.average_score == null
                        ? '—'
                        : stats.average_score.toFixed(2)
                  }
                />
              </div>
            )}
          </section>

          {/* ---- Deadline ---- */}
          <section className="space-y-2">
            <SectionLabel>Дедлайн</SectionLabel>
            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="hw-drawer-due">Срок сдачи</Label>
                <Input
                  id="hw-drawer-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.currentTarget.value)}
                  data-testid="hw-drawer-due"
                />
                <p className="text-xs text-muted-foreground">
                  Применяется ко всем заданиям без собственного дедлайна.
                </p>
              </div>
            ) : (
              <p className="text-sm">
                {homework.due_at ? (
                  <span className="font-mono">
                    {formatDateTime(homework.due_at)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">не задан</span>
                )}
              </p>
            )}
          </section>

          {/* ---- Description ---- */}
          <section className="space-y-2">
            <SectionLabel>Описание</SectionLabel>
            {editing ? (
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                placeholder="Опишите тему недели и задания"
              />
            ) : homework.description ? (
              // Match HomeworkDetailPage: no live markdown render — just
              // whitespace-preserved text. Good enough for the v1 drawer.
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                {homework.description}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Нет описания.</p>
            )}
          </section>
        </div>

        {canManage && (
          <SheetFooter className="border-t border-border/50 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {!editing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onToggleArchive}
                  disabled={update.isPending}
                  data-testid="hw-drawer-archive"
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      Восстановить
                    </>
                  ) : (
                    <>
                      <Archive className="mr-2 h-4 w-4" />В архив
                    </>
                  )}
                </Button>
              )}
              {!editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={remove.isPending}
                  data-testid="hw-drawer-delete"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      // discard edits — re-seed from the persisted homework
                      setTitle(homework.title);
                      setDescription(homework.description ?? '');
                      setDueAt(toLocalDateTimeInput(homework.due_at));
                      setEditing(false);
                    }}
                    disabled={update.isPending}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    onClick={onSave}
                    disabled={update.isPending}
                    data-testid="hw-drawer-save"
                  >
                    {update.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Сохранить
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={() => setEditing(true)}
                  data-testid="hw-drawer-edit"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Редактировать
                </Button>
              )}
            </div>
          </SheetFooter>
        )}

        <ConfirmDialog
          opened={confirmDelete}
          title="Удалить ДЗ?"
          message={`«${homework.title}» и все его задания будут удалены. Это нельзя отменить.`}
          confirmLabel="Удалить"
          destructive
          loading={remove.isPending}
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

interface StatCellProps {
  label: string;
  value: string | number;
}
function StatCell({ label, value }: StatCellProps) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 font-mono text-sm tabular-nums')}>
        {value}
      </div>
    </div>
  );
}

export default HomeworkDrawer;
