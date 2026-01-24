/**
 * MyDashboardPage — student kabinet at /me.
 *
 * Mirrors the teacher's /courses tree (CoursesListPage) so the student
 * has the same mental model: list of courses, with each course's ДЗ
 * inlined below it. The only difference is navigation — every leaf
 * link goes to the student's own submission view (/me/assignments/:id)
 * rather than the teacher's edit surface.
 *
 * Design-system contract:
 *   • Flat document — PageHeader («Мои курсы») then a hairline divider
 *     list of courses. No `Section` wrapper, no Card chrome (kills the
 *     «всё в блоке» anti-pattern).
 *   • Course header is plain text — BookOpen + name + (optional)
 *     semester line. The role chip («студент») was redundant: the
 *     student knows what they are.
 *   • Tasks inside an expanded multi-task ДЗ are plain text links —
 *     no fake `>` bullets that don't actually expand.
 *
 * Inbox + activity log were dropped earlier (bell handles inbox,
 * activity was teacher-only).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  KeyRound,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useAssignmentsByCourse } from '@/hooks/api/useAssignments';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { JoinByCodeDialog } from '@/components/courses/JoinByCodeDialog';
import type { CourseBrief } from '@/api/endpoints/courses';
import type { Homework } from '@/api/endpoints/homeworks';
import type { AssignmentBrief } from '@/api/endpoints/assignments';

function formatDueShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function MyDashboardPage() {
  useDocumentTitle('Мои курсы');
  const myCoursesQ = useMyCourses();
  const myCourses = myCoursesQ.data?.data ?? [];
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <Page width="regular" data-testid="my-dashboard">
      <PageHeader
        title={<span data-testid="my-dashboard-title">Мои курсы</span>}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setJoinOpen(true)}
            data-testid="my-dashboard-join-by-code"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Присоединиться по коду
          </Button>
        }
      />

      {myCourses.length === 0 ? (
        <EmptyState
          data-testid="my-dashboard-empty"
          title={
            myCoursesQ.isLoading
              ? 'Загружаем…'
              : 'Используйте код приглашения.'
          }
          action={
            !myCoursesQ.isLoading ? (
              <Button onClick={() => setJoinOpen(true)}>Присоединиться</Button>
            ) : undefined
          }
        />
      ) : (
        <div
          className="divide-y divide-border/50 border-t border-border/50"
          data-testid="my-courses-list"
        >
          {myCourses.map((c) => (
            <CourseSection key={c.id} course={c} />
          ))}
        </div>
      )}

      <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </Page>
  );
}

/** One course section in the student tree. Mirrors
 *  CoursesListPage.CourseSection — only the navigation targets on
 *  the leaves differ (`/me/assignments/:id` so a click on a task
 *  lands the student on their own submission, not the teacher's
 *  edit page).
 *
 *  Same N+1-avoidance: ONE useAssignmentsByCourse call per course,
 *  then we group assignments by homework_id client-side. Shares
 *  react-query cache keys with the teacher's CoursesListPage +
 *  CourseDetailPage so warm cache is reused across roles.
 */
function CourseSection({ course }: { course: CourseBrief }) {
  const hwQ = useHomeworksForCourse(course.id, { limit: 100 });
  const asgQ = useAssignmentsByCourse(course.id, {
    limit: 500,
    sort: '-deadline_soft_at',
  });
  const homeworks = hwQ.data?.data ?? [];
  const asgByHwId = useMemo(() => {
    const m = new Map<string, AssignmentBrief[]>();
    for (const a of asgQ.data?.data ?? []) {
      if (a.homework_id == null) continue;
      const key = String(a.homework_id);
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    }
    return m;
  }, [asgQ.data]);

  return (
    <section
      data-testid={`my-course-row-${course.slug}`}
      data-course-id={course.id}
      className="py-8"
    >
      <Link
        to={`/courses/${course.slug}`}
        className="flex items-center justify-between gap-4 transition-colors hover:text-foreground"
      >
        <div className="flex items-center gap-4 min-w-0">
          <BookOpen className="h-6 w-6 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-xl font-semibold tracking-tight truncate">
              {course.name}
            </div>
            {course.semester && (
              <div className="mt-1 text-sm text-muted-foreground">
                {course.semester}
              </div>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-5 pl-10">
        {hwQ.isLoading ? (
          <div className="divide-y divide-border/30">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-3.5"
                aria-busy="true"
              >
                <span aria-hidden className="w-5" />
                <span className="h-4 flex-1 min-w-0 rounded bg-muted/50 animate-pulse" />
              </div>
            ))}
          </div>
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
                assignmentsLoading={asgQ.isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Homework row inside CourseSection.
 *
 *   • Single-task ДЗ (≤1 assignment): the whole title is a Link to
 *     the student's submission view for that one task —
 *     /me/assignments/:id. If there's no assignment yet (empty
 *     homework) the row links to the homework page in read-only mode.
 *   • Multi-task ДЗ (≥2 assignments): the title toggles an inline
 *     expand. Each task in the expanded list is a plain text Link
 *     to /me/assignments/:id — no `>` bullet (it'd read as a fake
 *     expand toggle, but tasks don't have anything to expand).
 *     A small `→` icon on the right opens the full homework page.
 */
function HomeworkSubrow({
  hw,
  courseSlug,
  assignments,
  assignmentsLoading,
}: {
  hw: Homework;
  courseSlug: string;
  assignments: AssignmentBrief[];
  assignmentsLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isMulti = !assignmentsLoading && assignments.length >= 2;
  const due = formatDueShort(hw.due_at);
  const hwHref = `/courses/${courseSlug}/homeworks/${hw.slug}`;
  const onlyTaskHref =
    !assignmentsLoading && assignments.length === 1
      ? `/me/assignments/${assignments[0]!.id}`
      : hwHref;

  if (assignmentsLoading) {
    return (
      <div
        data-testid={`my-hw-${hw.id}`}
        className="flex items-center gap-3 py-3.5"
        aria-busy="true"
      >
        <span aria-hidden className="w-5" />
        <span className="h-4 flex-1 min-w-0 rounded bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (!isMulti) {
    return (
      <div data-testid={`my-hw-${hw.id}`}>
        <Link
          to={onlyTaskHref}
          data-testid={`my-hw-link-${hw.id}`}
          className="w-full flex items-center gap-3 py-3.5 text-left text-foreground hover:underline"
        >
          <span aria-hidden className="w-5" />
          <span className="flex-1 min-w-0 flex items-center justify-between gap-4">
            <span className="text-base font-medium truncate">{hw.title}</span>
            {due && (
              <span className="text-sm text-muted-foreground shrink-0">
                до {due}
              </span>
            )}
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div data-testid={`my-hw-${hw.id}`}>
      <div className="group/row w-full flex items-center gap-2 -mx-2 px-2 rounded hover:bg-muted/20">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Свернуть задачи' : 'Развернуть задачи'}
          data-testid={`my-hw-toggle-${hw.id}`}
          className="flex-1 min-w-0 flex items-center gap-3 py-3.5 text-left text-foreground"
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
            <span className="flex items-center gap-3 shrink-0 text-sm text-muted-foreground">
              <span className="tabular-nums">{assignments.length} задач</span>
              {due && <span>до {due}</span>}
            </span>
          </span>
        </button>
        <Link
          to={hwHref}
          data-testid={`my-hw-link-${hw.id}`}
          aria-label="К странице ДЗ"
          title="К странице ДЗ"
          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-foreground group-hover/row:text-muted-foreground/80"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {open && (
        <ul className="pl-9 pb-3 space-y-1">
          {assignments.map((a) => (
            <li key={a.id}>
              <Link
                to={`/me/assignments/${a.id}`}
                data-testid={`my-task-link-${a.id}`}
                className="block truncate py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
