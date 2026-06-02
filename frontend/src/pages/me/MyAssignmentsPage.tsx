/**
 * Student "My assignments" — list of all assignments visible to the current
 * student. The page renders **homework-level** rows (i.e. one Yandex.Contest
 * = one row), not flat assignments, because most courses bundle ~10 problems
 * per contest. Clicking a homework expands its problems inline.
 *
 * Special cases:
 *   • If a homework contains a single problem we render the problem row
 *     directly (no collapse), so the student doesn't need an extra click.
 *   • Assignments that have no homework_id (legacy or single-task homeworks
 *     with slug=`default`) render as plain rows.
 *
 * Tabs split by status:
 *   • Активные  — at least one problem still has hard deadline ahead
 *   • Просроченные — every problem's hard deadline has passed
 *   • Все       — everything
 */
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/auth/useAuth';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useMyAssignments } from '@/hooks/api/useAssignments';
import { homeworksApi } from '@/api/endpoints/homeworks';
import { homeworkKeys } from '@/hooks/api/useHomeworks';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/layout/Page';
import { RedeemInvitePanel } from '@/components/common/RedeemInvitePanel';

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

type Tone = 'high' | 'mid' | 'low' | 'muted';

const toneBadge: Record<Tone, string> = {
  high: 'bg-sev-high-bg text-sev-high',
  mid: 'bg-sev-mid-bg text-sev-mid',
  low: 'bg-sev-low-bg text-sev-low',
  muted: 'bg-muted text-muted-foreground',
};
const toneDot: Record<Tone, string> = {
  high: 'bg-sev-high',
  mid: 'bg-sev-mid',
  low: 'bg-sev-low',
  muted: 'bg-muted-foreground/40',
};

function deadlineState(
  t: (key: string, params?: Record<string, string | number>) => string,
  softAt?: string | null,
  hardAt?: string | null,
): { label: string; tone: Tone } {
  const now = Date.now();
  if (hardAt && new Date(hardAt).getTime() < now) {
    return { label: t('my_asg.deadline_passed'), tone: 'muted' };
  }
  if (softAt && new Date(softAt).getTime() < now) {
    return { label: t('my_asg.after_soft'), tone: 'mid' };
  }
  if (hardAt) {
    const ms = new Date(hardAt).getTime() - now;
    const days = Math.max(0, Math.round(ms / 86400000));
    if (days === 0) {
      const hours = Math.max(1, Math.round(ms / 3600000));
      return { label: t('my_asg.deadline_in_hours', { hours }), tone: 'high' };
    }
    if (days <= 2)
      return { label: t('my_asg.deadline_in_days', { days }), tone: 'mid' };
    return { label: t('my_asg.deadline_in_days', { days }), tone: 'low' };
  }
  return { label: t('my_asg.no_deadline'), tone: 'low' };
}

type Tab = 'active' | 'overdue' | 'all';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isOverdue = (a: any): boolean =>
  !!a.deadline_hard_at && new Date(a.deadline_hard_at).getTime() < Date.now();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deadlineMs = (a: any): number => {
  const v = a.deadline_hard_at ?? a.deadline_soft_at;
  return v ? new Date(v).getTime() : Number.POSITIVE_INFINITY;
};

export default function MyAssignmentsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('my_asg.title'));
  const { user } = useAuth();
  const myCoursesQ = useMyCourses();
  const allAssignmentsQ = useMyAssignments();
  const [tab, setTab] = useState<Tab>('active');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [redeemOpen, setRedeemOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses: any[] = Array.isArray(myCoursesQ.data)
    ? myCoursesQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((myCoursesQ.data as any)?.data ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = Array.isArray(allAssignmentsQ.data)
    ? allAssignmentsQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((allAssignmentsQ.data as any)?.data ?? []);

  // Filter assignments by status (the tab filter applies to *individual*
  // assignments — a homework is "active" if any of its tasks is active).
  const filtered = useMemo(() => {
    if (tab === 'active') return assignments.filter((a) => !isOverdue(a));
    if (tab === 'overdue') return assignments.filter(isOverdue);
    return assignments;
  }, [tab, assignments]);

  const counts = useMemo(
    () => ({
      active: assignments.filter((a) => !isOverdue(a)).length,
      overdue: assignments.filter(isOverdue).length,
      all: assignments.length,
    }),
    [assignments],
  );

  // Bucket filtered assignments by course
   
  const byCourse = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = new Map<string, any[]>();
    for (const a of filtered) {
      const k = String(a.course_id);
      const list = m.get(k) ?? [];
      list.push(a);
      m.set(k, list);
    }
    return m;
  }, [filtered]);

  // Sort each course's assignments by deadline
  for (const list of byCourse.values()) {
    list.sort((a, b) => {
      if (tab === 'overdue') return deadlineMs(b) - deadlineMs(a);
      return deadlineMs(a) - deadlineMs(b);
    });
  }

  const sortedCourses = useMemo(() => {
    const earliest = (cid: string): number => {
      const list = byCourse.get(cid) ?? [];
      let best = Number.POSITIVE_INFINITY;
      for (const a of list) {
        const ms = deadlineMs(a);
        if (ms < best) best = ms;
      }
      return best;
    };
    return [...courses]
      .filter((c) => byCourse.has(String(c.id)))
      .sort(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any, b: any) =>
          earliest(String(a.id)) - earliest(String(b.id)),
      );
  }, [courses, byCourse]);

  // Fetch homeworks for any course that has at least one assignment with homework_id
  const homeworkLookupCourseIds = useMemo(() => {
    const ids: string[] = [];
    for (const c of sortedCourses) {
      const list = byCourse.get(String(c.id)) ?? [];
      const anyHw = list.some((a) => a.homework_id != null);
      if (anyHw) ids.push(String(c.id));
    }
    return ids;
  }, [sortedCourses, byCourse]);

  const homeworkQueries = useQueries({
    queries: homeworkLookupCourseIds.map((cid) => ({
      queryKey: [...homeworkKeys.forCourse(cid), { limit: 100 }],
      queryFn: () => homeworksApi.listForCourse(cid, { limit: 100 }),
      enabled: !!cid,
    })),
  });

  const homeworksByCourse = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, Map<string, any>>();
    homeworkLookupCourseIds.forEach((cid, i) => {
      const data = homeworkQueries[i]?.data?.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = new Map<string, any>();
      for (const hw of data) inner.set(String(hw.id), hw);
      map.set(cid, inner);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    homeworkLookupCourseIds,
    homeworkQueries.map((q) => q.dataUpdatedAt).join(','),
  ]);

  const isPending = myCoursesQ.isPending || allAssignmentsQ.isPending;
  const hasNothingYet =
    isPending && courses.length === 0 && assignments.length === 0;

  const emptyForTab =
    tab === 'active'
      ? t('my_asg.empty_active')
      : tab === 'overdue'
      ? t('my_asg.empty_overdue')
      : t('my_asg.empty_all');

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Page>
      <PageHeader title={t('my_asg.title')} />

      {hasNothingYet ? (
        <MyAssignmentsSkeleton />
      ) : courses.length === 0 ? (
        // Neutral empty state — same view for student / teacher / assistant
        // before they're attached to any course. No 'попросите преподавателя'
        // line because the visitor might *be* the teacher.
        <div className="space-y-4 border-t border-border/50 py-6">
          <p className="text-sm text-muted-foreground">
            {user
              ? t('my_asg.empty_courses_user')
              : t('my_asg.empty_courses_guest')}
          </p>
          {user && (
            redeemOpen ? (
              <div className="max-w-md" data-testid="my-courses-redeem-inline">
                <RedeemInvitePanel />
                <button
                  type="button"
                  onClick={() => setRedeemOpen(false)}
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('my_asg.hide')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRedeemOpen(true)}
                data-testid="my-courses-redeem-open"
                className="text-sm font-medium text-foreground hover:underline"
              >
                {t('my_asg.join_by_code')}
              </button>
            )
          )}
        </div>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="active" data-testid="my-assignments-tab-active">
                {t('my_asg.tab_active')}
                <span className="ml-2 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                  {counts.active}
                </span>
              </TabsTrigger>
              <TabsTrigger value="overdue" data-testid="my-assignments-tab-overdue">
                {t('my_asg.tab_overdue')}
                <span className="ml-2 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                  {counts.overdue}
                </span>
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="my-assignments-tab-all">
                {t('my_asg.tab_all')}
                <span className="ml-2 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                  {counts.all}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {sortedCourses.length === 0 ? (
            <p className="border-t border-border/50 py-10 text-center text-sm text-muted-foreground">
              {emptyForTab}
            </p>
          ) : (
            <div className="space-y-8">
              {sortedCourses.map((c) => {
                const courseAssignments = byCourse.get(String(c.id)) ?? [];
                const hwMap = homeworksByCourse.get(String(c.id));

                // Group by homework_id
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const groups = new Map<string, any[]>();
                for (const a of courseAssignments) {
                  const k =
                    a.homework_id != null ? String(a.homework_id) : '__none__';
                  const arr = groups.get(k) ?? [];
                  arr.push(a);
                  groups.set(k, arr);
                }

                // Build display rows: each row is either
                //   { kind: 'hw',  hw, items }  — homework with multiple tasks
                //   { kind: 'one', item }       — single-task row (legacy or hw with 1 task or default-slug hw)
                type Row =
                  | {
                      kind: 'hw';
                      key: string;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      hw: any;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      items: any[];
                    }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  | { kind: 'one'; key: string; item: any };
                const rows: Row[] = [];

                // Order homework rows by position then earliest deadline
                const orderedHwIds = [...groups.keys()]
                  .filter((k) => k !== '__none__')
                  .sort((a, b) => {
                    const ha = hwMap?.get(a);
                    const hb = hwMap?.get(b);
                    const pa = ha?.position ?? 999;
                    const pb = hb?.position ?? 999;
                    if (pa !== pb) return pa - pb;
                    const aMs = Math.min(
                      ...(groups.get(a)?.map(deadlineMs) ?? [Infinity]),
                    );
                    const bMs = Math.min(
                      ...(groups.get(b)?.map(deadlineMs) ?? [Infinity]),
                    );
                    return aMs - bMs;
                  });

                for (const hwId of orderedHwIds) {
                  const items = groups.get(hwId) ?? [];
                  const hw = hwMap?.get(hwId);
                  // Treat `default` slug or single-task homeworks as one-task rows
                  if (!hw || hw.slug === 'default' || items.length === 1) {
                    for (const it of items) {
                      rows.push({
                        kind: 'one',
                        key: `one-${it.id}`,
                        item: it,
                      });
                    }
                  } else {
                    rows.push({
                      kind: 'hw',
                      key: `hw-${hwId}`,
                      hw,
                      items,
                    });
                  }
                }

                // Legacy assignments without homework_id
                const legacy = groups.get('__none__') ?? [];
                for (const it of legacy) {
                  rows.push({ kind: 'one', key: `one-${it.id}`, item: it });
                }

                return (
                  <section key={c.id} className="space-y-3">
                    <div className="flex items-baseline gap-3 border-b border-border/70 pb-2">
                      <h2 className="text-xl font-bold">{c.name}</h2>
                    </div>

                    {rows.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {t('my_asg.course_empty_filter')}
                      </p>
                    ) : (
                      <div className="border-y border-border/50">
                        {rows.map((row, idx) => (
                          <div
                            key={row.key}
                            className={idx > 0 ? 'border-t border-border/50' : ''}
                          >
                            {row.kind === 'one' ? (
                              <AssignmentRow item={row.item} />
                            ) : (
                              <HomeworkRow
                                hw={row.hw}
                                items={row.items}
                                isOpen={expanded.has(row.key)}
                                onToggle={() => toggleExpand(row.key)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

/** Loading skeleton that mirrors the loaded layout: tabs row → a course
 *  section (bold title + bottom rule) → a bordered list of rows, each row
 *  shaped like `AssignmentRow` (leading dot · two text lines · trailing pill).
 *  Lives inside the same `<Page>` so width/padding already match. */
function MyAssignmentsSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('skeleton.aria_label')}
      className="space-y-8"
    >
      {/* Tabs row — 3 trigger-shaped pills */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-md bg-muted/40" />
        <Skeleton className="h-8 w-28 rounded-md bg-muted/40" />
        <Skeleton className="h-8 w-20 rounded-md bg-muted/40" />
      </div>

      {/* One course section: title bar + bordered rows */}
      <section className="space-y-3">
        <div className="border-b border-border/70 pb-2">
          <Skeleton className="h-6 w-48 rounded-md bg-muted/40" />
        </div>
        <div className="border-y border-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 px-5 py-4 ${
                i > 0 ? 'border-t border-border/50' : ''
              }`}
            >
              <Skeleton className="h-2 w-2 flex-none rounded-full bg-muted/40" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/5 rounded-md bg-muted/40" />
                <Skeleton className="h-3 w-3/5 rounded-md bg-muted/30" />
              </div>
              <Skeleton className="h-6 w-24 flex-none rounded-full bg-muted/30" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssignmentRow({ item: a }: { item: any }) {
  const { t } = useTranslation();
  const ds = deadlineState(t, a.deadline_soft_at, a.deadline_hard_at);
  return (
    <Link
      to={`/me/assignments/${a.id}`}
      data-testid={`my-assignment-row-${a.id}`}
      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
    >
      <span className={`h-2 w-2 flex-none rounded-full ${toneDot[ds.tone]}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {a.title}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {(a.language_hint === 'pdf' ? 'PDF' : a.language_hint) ??
            t('my_asg.no_language')}{' '}
          ·{' '}
          {t('my_asg.due_at', { date: fmt(a.deadline_hard_at) })} ·{' '}
          {t('my_asg.max')} <span className="tabular-nums">{a.max_score ?? '—'}</span>
        </div>
      </div>
      <span
        className={`flex-none rounded-full px-3 py-1 text-xs font-medium ${toneBadge[ds.tone]}`}
      >
        {ds.label}
      </span>
    </Link>
  );
}

function HomeworkRow({
  hw,
  items,
  isOpen,
  onToggle,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hw: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  // Aggregate state across all tasks in this homework.
  const activeCount = items.filter((a) => !isOverdue(a)).length;
  const overdueCount = items.length - activeCount;
  const allOverdue = activeCount === 0;

  // Aggregate deadline: earliest active hard, or latest hard if all overdue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggDeadline = ((): any => {
    const actives = items
      .filter((a) => !isOverdue(a))
      .map((a) => a.deadline_hard_at)
      .filter(Boolean);
    if (actives.length > 0) {
      return actives.reduce((a, b) =>
        new Date(a).getTime() < new Date(b).getTime() ? a : b,
      );
    }
    const overdues = items
      .map((a) => a.deadline_hard_at)
      .filter(Boolean);
    return overdues.length
      ? overdues.reduce((a, b) =>
          new Date(a).getTime() > new Date(b).getTime() ? a : b,
        )
      : null;
  })();

  const ds = deadlineState(t, hw.due_at ?? null, aggDeadline);
  // Select the grammatically-correct plural form by count; each form is a
  // full phrase key so RU declensions and EN plural stay correct.
  const taskCountKey =
    items.length === 1
      ? 'my_asg.tasks_one'
      : items.length < 5
      ? 'my_asg.tasks_few'
      : 'my_asg.tasks_many';
  const titleSummary = t(taskCountKey, { count: items.length });

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`my-homework-row-${hw.id}`}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className={`h-2 w-2 flex-none rounded-full ${toneDot[ds.tone]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('my_asg.hw_badge')}
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {hw.title}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {titleSummary}
            {!allOverdue && overdueCount > 0 && (
              <> · {t('my_asg.overdue_count', { count: overdueCount })}</>
            )}
            {aggDeadline && (
              <> · {t('my_asg.due_at', { date: fmt(aggDeadline) })}</>
            )}
          </div>
        </div>
        <span
          className={`flex-none rounded-full px-3 py-1 text-xs font-medium ${toneBadge[ds.tone]}`}
        >
          {ds.label}
        </span>
        <span className="flex-none text-muted-foreground">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>
      {isOpen && (
        <div className="bg-muted/20">
          {items.map((a, idx) => (
            <div
              key={a.id}
              className={
                idx === 0
                  ? 'border-t border-border/70'
                  : 'border-t border-border/40'
              }
            >
              <Link
                to={`/me/assignments/${a.id}`}
                data-testid={`my-assignment-row-${a.id}`}
                className="flex items-center gap-4 px-5 py-3 pl-12 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('my_asg.due_at', { date: fmt(a.deadline_hard_at) })}
                </span>
                <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                  {t('my_asg.max')} {a.max_score ?? '—'}
                </span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
