/**
 * MyDashboardPage — `/me` student cabinet.
 *
 * Same mental model as the teacher's /courses tree (CoursesListPage):
 * курс → ДЗ → задание. The only differences a student notices:
 *
 *   • Right side of each task row shows the student's status — score
 *     when the teacher has released the grade, «на проверке» when the
 *     last accepted attempt is still ungraded, the failing verdict
 *     (WA / CE / PE / RTE) when no OK exists yet, or empty when the
 *     student never attempted.
 *   • Tapping a task row navigates to the relevant surface — to the
 *     student's submission detail when there's an OK attempt to read,
 *     to the assignment page otherwise.
 *   • A small «info» icon next to the title opens the condition in a
 *     modal so the student can re-read the task without leaving their
 *     position in the tree.
 *
 * Header carries only «+ По коду». No widgets, no Hero stats —
 * everything fits in the tree.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Info, KeyRound, Loader2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/auth/useAuth';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useAssignmentsByCourse } from '@/hooks/api/useAssignments';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { JoinByCodeDialog } from '@/components/courses/JoinByCodeDialog';
import { AssignmentConditionDialog } from '@/components/assignments/AssignmentConditionDialog';
import type { CourseBrief } from '@/api/endpoints/courses';
import type { Homework } from '@/api/endpoints/homeworks';
import type { AssignmentBrief } from '@/api/endpoints/assignments';
import { cn } from '@/components/ui/utils';

function isAccepted(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === 'ok' || s === 'accepted';
}

interface MySub {
  id: string;
  assignment_id: string;
  course_id?: string;
  submitted_at: string;
  external_verdict?: string | null;
  score?: number | null;
  max_score?: number | null;
}

interface TaskStatus {
  /** Tone the right-hand label uses. */
  tone: 'graded' | 'pending' | 'failed' | 'none';
  /** Visible text right of the title. */
  label: string;
  /** Optional submission id to jump to. */
  submissionId: string | null;
}

/** Aggregate the student's attempts on a single assignment into one
 *  status. Latest-OK with a released grade wins; otherwise the most
 *  recent OK (without a score) reads «на проверке»; otherwise the
 *  newest failed verdict surfaces. No attempts at all → empty. */
function statusForAssignment(subs: MySub[]): TaskStatus {
  if (subs.length === 0) {
    return { tone: 'none', label: '', submissionId: null };
  }
  const sorted = subs
    .slice()
    .sort(
      (a, b) =>
        new Date(b.submitted_at).getTime() -
        new Date(a.submitted_at).getTime(),
    );
  const oks = sorted.filter((s) => isAccepted(s.external_verdict));
  if (oks.length > 0) {
    const okGraded = oks.find((s) => s.score != null);
    if (okGraded) {
      const max = okGraded.max_score;
      return {
        tone: 'graded',
        label:
          max != null
            ? `${Number(okGraded.score).toFixed(1)} / ${max}`
            : Number(okGraded.score).toFixed(1),
        submissionId: okGraded.id,
      };
    }
    return {
      tone: 'pending',
      label: 'на проверке',
      submissionId: oks[0].id,
    };
  }
  const last = sorted[0];
  return {
    tone: 'failed',
    label: last.external_verdict ?? '',
    submissionId: last.id,
  };
}

export default function MyDashboardPage() {
  useDocumentTitle('Главная');
  const { user } = useAuth();
  const myCoursesQ = useMyCourses();
  const mySubsQ = useMySubmissions({ limit: 500 });
  const [joinOpen, setJoinOpen] = useState(false);
  const [conditionAsgId, setConditionAsgId] = useState<string | null>(null);

  const myCourses = myCoursesQ.data?.data ?? [];
  const subsData = mySubsQ.data as unknown;
  const mySubs: MySub[] = Array.isArray(subsData)
    ? (subsData as MySub[])
    : ((subsData as { data?: MySub[] })?.data ?? []);

  const subsByAsgId = useMemo(() => {
    const m = new Map<string, MySub[]>();
    for (const s of mySubs) {
      const key = String(s.assignment_id);
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [mySubs]);

  const greeting = user?.display_name
    ? `Привет, ${user.display_name.split(' ')[0]}`
    : 'Главная';

  const joinAction = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setJoinOpen(true)}
      data-testid="dashboard-join-by-code"
    >
      <KeyRound className="mr-2 h-4 w-4" />
      По коду
    </Button>
  );

  if (myCoursesQ.isLoading && myCourses.length === 0) {
    return (
      <Page width="regular" data-testid="my-dashboard">
        <PageHeader title={<span data-testid="my-dashboard-title">{greeting}</span>} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Page>
    );
  }

  if (myCourses.length === 0) {
    return (
      <Page width="regular" data-testid="my-dashboard">
        <PageHeader title={<span data-testid="my-dashboard-title">{greeting}</span>} />
        <EmptyState
          data-testid="my-dashboard-empty"
          title="У вас пока нет курсов"
          description="Преподаватель выдаст вам код приглашения — введите его, чтобы попасть в курс."
          action={
            <Button onClick={() => setJoinOpen(true)} data-testid="dashboard-empty-cta">
              <KeyRound className="mr-2 h-4 w-4" />
              Ввести код
            </Button>
          }
        />
        <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </Page>
    );
  }

  return (
    <Page width="regular" data-testid="my-dashboard">
      <PageHeader
        title={<span data-testid="my-dashboard-title">{greeting}</span>}
        action={joinAction}
      />

      <div
        className="divide-y divide-border/50 border-t border-border/50"
        data-testid="my-courses-list"
      >
        {myCourses.map((c) => (
          <CourseSection
            key={c.id}
            course={c}
            subsByAsgId={subsByAsgId}
            onOpenCondition={setConditionAsgId}
          />
        ))}
      </div>

      <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
      <AssignmentConditionDialog
        assignmentId={conditionAsgId}
        open={conditionAsgId !== null}
        onOpenChange={(o) => {
          if (!o) setConditionAsgId(null);
        }}
      />
    </Page>
  );
}

/* -- course node ------------------------------------------------------ */

function CourseSection({
  course,
  subsByAsgId,
  onOpenCondition,
}: {
  course: CourseBrief;
  subsByAsgId: Map<string, MySub[]>;
  onOpenCondition: (id: string) => void;
}) {
  const hwQ = useHomeworksForCourse(course.id, { limit: 100 });
  const asgQ = useAssignmentsByCourse(course.id, {
    limit: 500,
    sort: '-deadline_soft_at',
  });
  const homeworks = hwQ.data?.data ?? [];
  const assignments = asgQ.data?.data ?? [];

  // Group assignments by homework_id, AND only keep ones whose ДЗ is
  // present in the homeworks list — backend's /courses/:id/assignments
  // can include orphaned / archived rows that we never render in the
  // tree, and counting them in «N из M сдано» reads as a phantom +10.
  // Source of truth = «what the student actually sees here».
  const visibleHwIds = useMemo(
    () => new Set(homeworks.map((h) => String(h.id))),
    [homeworks],
  );
  const asgByHwId = useMemo(() => {
    const m = new Map<string, AssignmentBrief[]>();
    for (const a of assignments) {
      if (a.homework_id == null) continue;
      const key = String(a.homework_id);
      if (!visibleHwIds.has(key)) continue;
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    }
    return m;
  }, [assignments, visibleHwIds]);

  // Course-row aggregates run on the assignments the student will actually
  // see when they expand the ДЗ list — anything else is invisible to them
  // and confusing in the counter. «Сдано» means «оценка released», not
  // «есть OK». «На проверке» counts as not-yet-сдано.
  const visibleAssignments = useMemo(
    () => Array.from(asgByHwId.values()).flat(),
    [asgByHwId],
  );
  const total = visibleAssignments.length;
  const gradedCount = visibleAssignments.filter((a) => {
    const subs = subsByAsgId.get(String(a.id)) ?? [];
    return subs.some((s) => s.score != null);
  }).length;
  const mean = (() => {
    const scores: number[] = [];
    for (const a of visibleAssignments) {
      const subs = subsByAsgId.get(String(a.id)) ?? [];
      const okGraded = subs
        .filter((s) => isAccepted(s.external_verdict) && s.score != null)
        .sort(
          (x, y) =>
            new Date(y.submitted_at).getTime() -
            new Date(x.submitted_at).getTime(),
        )[0];
      if (okGraded?.score != null) scores.push(Number(okGraded.score));
    }
    if (scores.length === 0) return null;
    return (scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1);
  })();

  return (
    <section
      data-testid={`my-course-row-${course.slug}`}
      data-course-id={course.id}
      className="py-6"
    >
      <Link
        to={`/courses/${course.slug}`}
        className="flex items-center justify-between gap-4 transition-colors hover:text-foreground"
      >
        <div className="min-w-0">
          <div className="text-xl font-semibold tracking-tight truncate">
            {course.name}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {gradedCount} из {total} сдано
            </span>
            {mean != null && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">средний балл {mean}</span>
              </>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-5 pl-3">
        {hwQ.isLoading ? (
          <div className="py-3 text-sm text-muted-foreground">Загружаем…</div>
        ) : homeworks.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">Нет ДЗ</div>
        ) : (
          <div className="divide-y divide-border/30">
            {homeworks.map((hw) => (
              <HomeworkSubrow
                key={hw.id}
                hw={hw}
                courseSlug={course.slug}
                assignments={asgByHwId.get(String(hw.id)) ?? []}
                subsByAsgId={subsByAsgId}
                onOpenCondition={onOpenCondition}
                loadingAsg={asgQ.isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* -- homework node — expand/collapse to reveal its tasks -------------- */

function HomeworkSubrow({
  hw,
  courseSlug,
  assignments,
  subsByAsgId,
  onOpenCondition,
  loadingAsg,
}: {
  hw: Homework;
  courseSlug: string;
  assignments: AssignmentBrief[];
  subsByAsgId: Map<string, MySub[]>;
  onOpenCondition: (id: string) => void;
  loadingAsg: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hwHref = `/courses/${courseSlug}/homeworks/${hw.slug}`;

  // «Сдано» = teacher has released a score for the assignment; «OK
  // ещё не оценено» falls into «на проверке», not «сдано». The course-
  // header counter uses the same definition, so the two never disagree.
  const gradedCount = assignments.filter((a) => {
    const subs = subsByAsgId.get(String(a.id)) ?? [];
    return subs.some((s) => s.score != null);
  }).length;
  const totalCount = assignments.length;

  return (
    <div data-testid={`my-hw-${hw.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group/row w-full flex items-center gap-3 -mx-2 px-2 py-3.5 rounded hover:bg-muted/20 text-left"
        data-testid={`my-hw-toggle-${hw.id}`}
      >
        <span className="text-muted-foreground" aria-hidden>
          {open ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </span>
        <span className="flex-1 min-w-0 flex items-center justify-between gap-4">
          <span className="text-base font-medium truncate">{hw.title}</span>
          {totalCount > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground shrink-0">
              {gradedCount} / {totalCount}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="pl-9 pb-3">
          {loadingAsg ? (
            <div className="py-3 text-sm text-muted-foreground">Загружаем…</div>
          ) : assignments.length === 0 ? (
            <div className="py-2 text-sm text-muted-foreground">
              <Link to={hwHref} className="hover:underline">
                Открыть ДЗ →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/20">
              {assignments.map((a) => (
                <TaskRow
                  key={a.id}
                  assignment={a}
                  subs={subsByAsgId.get(String(a.id)) ?? []}
                  onOpenCondition={onOpenCondition}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* -- task row — title, status on the right, «i» icon ------------------ */

function TaskRow({
  assignment,
  subs,
  onOpenCondition,
}: {
  assignment: AssignmentBrief;
  subs: MySub[];
  onOpenCondition: (id: string) => void;
}) {
  const navigate = useNavigate();
  const status = useMemo(() => statusForAssignment(subs), [subs]);

  // Where a click on the row lands: the student's own submission if
  // there is one to read, otherwise the assignment detail (where they
  // can re-read the condition + use «Мои посылки» tab).
  const target = status.submissionId
    ? `/me/submissions/${status.submissionId}`
    : `/assignments/${assignment.id}`;

  const statusTone =
    status.tone === 'graded'
      ? 'text-foreground font-medium'
      : status.tone === 'pending'
        ? 'text-muted-foreground'
        : status.tone === 'failed'
          ? 'text-sev-high'
          : 'text-muted-foreground/40';

  return (
    <li
      className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors hover:bg-muted/15"
      data-testid={`my-task-${assignment.id}`}
    >
      <button
        type="button"
        onClick={() => navigate(target)}
        data-testid={`my-task-link-${assignment.id}`}
        className="flex-1 min-w-0 text-left text-sm text-foreground/90 truncate hover:underline"
      >
        {assignment.title}
      </button>
      {status.label && (
        <span
          className={cn('text-xs shrink-0 tabular-nums', statusTone)}
          data-testid={`my-task-status-${assignment.id}`}
        >
          {status.label}
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpenCondition(String(assignment.id))}
        title="Условие задания"
        aria-label="Условие задания"
        data-testid={`my-task-condition-${assignment.id}`}
        className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
      >
        <Info className="h-4 w-4" />
      </button>
    </li>
  );
}
