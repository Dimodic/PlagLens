import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCourses, useMyCourses } from '@/hooks/api/useCourses';
import {
  useHomeworkAssignments,
  useHomeworksForCourse,
} from '@/hooks/api/useHomeworks';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { CourseBrief } from '@/api/endpoints/courses';
import type { Homework } from '@/api/endpoints/homeworks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/layout/Page';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/components/ui/utils';

export default function CoursesListPage() {
  useDocumentTitle('Курсы');
  const { user } = useAuth();
  // Archive view is a toggle, not a tab: default off (показываем активные).
  // The full-width "Все / Активные / В архиве" tab strip read as too heavy
  // for a screen that mostly lists active courses anyway.
  const [showArchived, setShowArchived] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // When the user opens the search box, focus the input. When they close
  // it, clear the query so the list snaps back to the default view.
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    } else {
      setQ('');
    }
  }, [searchOpen]);

  const canCreate =
    user?.global_role === 'teacher' ||
    user?.global_role === 'admin' ||
    user?.global_role === 'super_admin';

  const status = showArchived ? 'archived' : 'active';
  const myList = useMyCourses();
  const courseFilters = {
    limit: 50,
    q: debouncedQ || undefined,
    status,
  } as const;
  const list = useCourses(courseFilters);

  const courses: CourseBrief[] = useMemo(() => {
    if (debouncedQ || showArchived) {
      return list.data?.data ?? [];
    }
    // Default view: only active courses. ``myList`` (GET /users/me/courses)
    // doesn't take a status filter, so we strip archived rows on the
    // client; otherwise toggling the archive button looked like a no-op
    // because archived courses kept showing up in the default list.
    const fromMy = (myList.data?.data ?? []).filter(
      (c) => c.status !== 'archived',
    );
    if (fromMy.length > 0) return fromMy;
    return (list.data?.data ?? []).filter((c) => c.status !== 'archived');
  }, [debouncedQ, showArchived, list.data, myList.data]);

  const filtering = !!debouncedQ || showArchived;

  return (
    <Page width="regular" data-testid="courses-list-page">
      <PageHeader
        title={<span data-testid="courses-list-title">Курсы</span>}
        action={
          // Three icon-style controls + create button. Search expands
          // in place (width animates 36 → 240px) so the surrounding
          // buttons don't reflow. Archive is a quiet toggle.
          <>
            {/* Collapsed state: render a plain ghost icon button — no
                border, no input chrome. Expanded state swaps in the
                real Input (with its rounded outline). Both share the
                same outer width-animating container so neighbouring
                buttons don't reflow. */}
            <div
              data-testid="courses-list-search"
              className={cn(
                'relative overflow-hidden transition-[width] duration-200 ease-out',
                searchOpen ? 'w-[240px]' : 'w-9',
              )}
            >
              {searchOpen ? (
                <>
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={q}
                    onChange={(e) => setQ(e.currentTarget.value)}
                    placeholder="Поиск"
                    aria-label="Поиск"
                    // Override shadcn's default 3px focus ring — it stacks
                    // with the rounded-full pill and reads as a fat double
                    // border. We keep just a single-color border that
                    // brightens on focus.
                    className="h-9 rounded-full pl-9 pr-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-foreground/30"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setSearchOpen(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSearchOpen(false)}
                    aria-label="Закрыть поиск"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Поиск"
                  data-testid="courses-list-search-toggle"
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              variant={showArchived ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              aria-label={showArchived ? 'Скрыть архив' : 'Показать архив'}
              title={showArchived ? 'Скрыть архив' : 'Показать архив'}
              data-testid="courses-list-archive-toggle"
            >
              <Archive className="h-4 w-4" />
            </Button>
            {!canCreate && (
              <Button asChild variant="outline" data-testid="courses-list-join-button">
                <Link to="/courses/join">Присоединиться</Link>
              </Button>
            )}
            {canCreate && (
              <Button asChild data-testid="courses-list-create-button">
                <Link to="/courses/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Создать
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* List */}
      {courses.length === 0 ? (
        <EmptyState
          data-testid="courses-list-empty"
          title={
            showArchived
              ? 'В архиве пусто.'
              : debouncedQ
                ? 'Ничего не нашлось.'
                : canCreate
                  ? 'У вас пока нет курсов.'
                  : 'Используйте код приглашения.'
          }
          action={
            !filtering && canCreate ? (
              <Button asChild>
                <Link to="/courses/new">Создать курс</Link>
              </Button>
            ) : !filtering && !canCreate ? (
              <Button asChild>
                <Link to="/courses/join">Присоединиться</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-border/50 border-t border-border/50">
          {courses.map((course) => (
            <CourseSection key={course.id} course={course} />
          ))}
        </div>
      )}
    </Page>
  );
}

function formatDueShort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${d.getFullYear()}`;
}

/** Document-style section: course header line + indented list of its
 * homeworks below. No Card chrome — sections are separated by hairline
 * dividers (`divide-y` on the parent). Each homework can be expanded to
 * show its assignments inline. */
function CourseSection({ course }: { course: CourseBrief }) {
  const hwQ = useHomeworksForCourse(course.id, { limit: 100 });
  const homeworks = hwQ.data?.data ?? [];
  return (
    <section
      data-testid={`courses-list-row-${course.slug}`}
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
        <div className="flex items-center gap-4 shrink-0">
          {/* "Активен" pill removed — archive-only lifecycle, default
              view already filters archive away. Archived courses get a
              tiny muted text marker so the toggled view still reads
              clearly. */}
          {course.status === 'archived' && (
            <span
              data-testid="course-card-status"
              className="text-xs text-muted-foreground/70"
            >
              в архиве
            </span>
          )}
          {typeof course.members_count === 'number' && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{course.members_count}</span>
            </div>
          )}
        </div>
      </Link>

      <div className="mt-5 pl-10">
        {hwQ.isLoading ? (
          <div className="py-2 text-sm text-muted-foreground">
            Загрузка ДЗ…
          </div>
        ) : homeworks.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">Нет ДЗ</div>
        ) : (
          <div className="divide-y divide-border/30">
            {homeworks.map((hw) => (
              <HomeworkSubrow key={hw.id} hw={hw} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** One row inside a CourseSection. Whole row toggles a lazily-fetched
 * assignments list inline — there is no standalone homework page any
 * more. Click anywhere on the row → expand / collapse. */
function HomeworkSubrow({ hw }: { hw: Homework }) {
  const [open, setOpen] = useState(false);
  const asgQ = useHomeworkAssignments(open ? hw.id : undefined, { limit: 50 });
  const assignments = asgQ.data?.data ?? [];
  const due = formatDueShort(hw.due_at);
  return (
    <div data-testid={`course-hw-${hw.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Свернуть задания' : 'Развернуть задания'}
        className="w-full flex items-center gap-3 py-3.5 text-left hover:text-foreground"
      >
        <span className="text-muted-foreground" aria-hidden>
          {open ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </span>
        <span className="flex-1 min-w-0 flex items-center justify-between gap-4">
          <span className="text-base font-medium text-foreground truncate">
            {hw.title}
          </span>
          {due && (
            <span className="text-sm text-muted-foreground shrink-0">
              до {due}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="pl-9 pb-3">
          {asgQ.isLoading ? (
            <div className="text-sm text-muted-foreground py-1.5">
              Загрузка…
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-1.5">
              Заданий нет
            </div>
          ) : (
            <ul className="space-y-1">
              {assignments.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/assignments/${a.id}`}
                    data-testid={`asg-row-${a.id}`}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate">{a.title}</span>
                    {a.language_hint && (
                      <span className="text-xs font-mono shrink-0">
                        {a.language_hint}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
