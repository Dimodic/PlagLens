/**
 * SubmissionsListPage — cross-course submission feed.
 *
 * Student → own submissions ("Мои посылки"). Staff → the triage queue
 * ("Посылки на проверку"): a course picker, status tabs, and — when a
 * course is selected — a "Распределить между ассистентами" button that
 * round-robins that course's submissions across its assistants. Each
 * row shows which assistant a submission landed on; an assistant can
 * flip the "Только мои" toggle to see just their pile.
 *
 * Backed by GET /users/me/submissions via useMySubmissions.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Users,
} from 'lucide-react';
import { SkeletonList } from '@/components/common/Skeleton';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Page, PageHeader } from '@/components/layout/Page';
import { Pagination } from '@/components/common/Pagination';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useDistributeSubmissions,
  useMySubmissions,
} from '@/hooks/api/useSubmissions';
import {
  useCourses,
  useCourseMembers,
  useCourseOwners,
} from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useAssignmentsByCourse } from '@/hooks/api/useAssignments';
import { useUsers } from '@/hooks/api/useUsers';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/auth/useAuth';
import { cn } from '@/components/ui/utils';
import { displayAuthor } from '@/api/endpoints/submissions';
import type {
  SubmissionBrief,
  SubmissionStatus,
} from '@/api/endpoints/submissions';

type StatusFilter = 'all' | 'flagged' | 'running' | 'checked';

function statusKey(s: SubmissionBrief): StatusFilter {
  if (s.flags?.suspicious || s.flags?.manually_flagged) return 'flagged';
  if (s.status === 'processing' || s.status === 'received') return 'running';
  return 'checked';
}

function getInitials(name: string): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
}

function MiniAvatar({ name }: { name: string }) {
  const initials = getInitials(name);
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
      {initials}
    </span>
  );
}

/** Segmented control — one rounded-full bar with N pill options
 *  inside. The active pill gets its own background so its state is
 *  unmistakable; inactive ones stay muted. Far clearer than the flat
 *  text-on-one-line variant the user described as "непонятно что и
 *  как" — the bar shape itself reads as a grouped control. */
function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      <div
        role="group"
        aria-label={label}
        className="inline-flex items-center rounded-full bg-muted/40 p-0.5"
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={cn(
                'rounded-full px-3 py-1 text-sm transition-colors',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Combobox styled identically to the course picker (outline button +
 *  ChevronsUpDown + Popover/Command list). Used for the ДЗ and task
 *  filters so all three read as one consistent control bar instead of
 *  a styled-button-next-to-a-raw-<select> mismatch. ``value === ''``
 *  means the "all" sentinel option is selected. */
function FilterCombo({
  value,
  onChange,
  options,
  allLabel,
  searchPlaceholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  searchPlaceholder?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 min-w-[220px] justify-between"
          data-testid={testId}
        >
          <span className="truncate">
            {value === '' ? allLabel : selected?.label ?? allLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? 'Найти…'} />
          <CommandList>
            <CommandEmpty>Ничего не найдено.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === '' ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === o.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SubmissionsListPage() {
  const { user } = useAuth();
  const notify = useNotifications();
  const isStaff =
    user?.global_role !== undefined && user.global_role !== 'student';
  const title = isStaff ? 'Посылки на проверку' : 'Мои посылки';
  useDocumentTitle(title);
  const [course, setCourse] = useState<string>('all');
  // ДЗ + task scope. '' = «все ДЗ курса» / «все задачи ДЗ». Picking a
  // ДЗ narrows the list to its assignments AND becomes the implicit
  // scope for the distribute action; picking a task narrows further to
  // that one assignment.
  const [homework, setHomework] = useState<string>('');
  const [assignment, setAssignment] = useState<string>('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  // Staff-only: "все" vs "только мои" (this assistant's distributed pile).
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'mine'>('all');
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever filters change so the user doesn't end up on
  // an empty page if the filtered total is smaller than their current
  // offset.
  useEffect(() => {
    setPage(1);
  }, [course, homework, assignment, filter, assignedFilter]);

  // ДЗ/task scope resets cascade: changing the course wipes both;
  // changing the ДЗ wipes the task. Otherwise a stale id from a
  // previous course would silently filter to nothing.
  useEffect(() => {
    setHomework('');
    setAssignment('');
  }, [course]);
  useEffect(() => {
    setAssignment('');
  }, [homework]);

  // Fetch all active courses for the picker — backend returns them in
  // a single request, no need to derive them from the submissions list
  // (which would only give us courses that actually have submissions,
  // missing the ones the teacher hasn't graded yet).
  const coursesQ = useCourses({ status: 'active', limit: 200 });
  const courseOptions = useMemo(
    () => coursesQ.data?.data ?? [],
    [coursesQ.data],
  );
  const selectedCourse = courseOptions.find((c) => c.id === course);
  // Map course_id → display name, used by the per-row meta line.
  const courseNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courseOptions) m.set(c.id, c.name);
    return m;
  }, [courseOptions]);

  // Course members — only fetched once a concrete course is selected;
  // used to build the assistant list for the distribute action. The
  // course service stores no names, so we resolve them from the
  // tenant's user list (staff-only endpoint, gated by ``isStaff``).
  const membersQ = useCourseMembers(
    isStaff && course !== 'all' ? course : undefined,
    'assistant',
  );
  const usersQ = useUsers({ limit: 200 }, { enabled: isStaff });
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usersQ.data?.data ?? []) m.set(u.id, u.display_name);
    return m;
  }, [usersQ.data]);
  // Owners + co-owners come from a separate course-service table. The
  // grader pool is owner + co_owner + assistant, so a teacher with no
  // assistants can still distribute (e.g. onto themselves).
  const ownersQ = useCourseOwners(
    isStaff && course !== 'all' ? course : undefined,
  );
  const assistants = useMemo(() => {
    const pool = new Map<string, { id: string; name: string }>();
    for (const o of ownersQ.data ?? []) {
      pool.set(o.user_id, {
        id: o.user_id,
        name:
          o.user?.display_name ?? nameById.get(o.user_id) ?? o.user_id,
      });
    }
    for (const m of membersQ.data?.data ?? []) {
      if (m.role !== 'assistant') continue;
      pool.set(m.user_id, {
        id: m.user_id,
        name: nameById.get(m.user_id) ?? m.user_id,
      });
    }
    return [...pool.values()];
  }, [ownersQ.data, membersQ.data, nameById]);

  // ---- Course homeworks + assignments (for the ДЗ / task pickers) ----
  const courseHwQ = useHomeworksForCourse(
    isStaff && course !== 'all' ? course : undefined,
    { limit: 200 },
  );
  const courseAsgQ = useAssignmentsByCourse(
    isStaff && course !== 'all' ? course : undefined,
    { limit: 500 },
  );
  const courseHomeworks = useMemo(
    () => courseHwQ.data?.data ?? [],
    [courseHwQ.data],
  );
  const courseAssignments = useMemo(
    () => courseAsgQ.data?.data ?? [],
    [courseAsgQ.data],
  );
  // alias maps for per-row labels.
  const asgTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of courseAssignments) m.set(String(a.id), a.title);
    return m;
  }, [courseAssignments]);
  const hwTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const hw of courseHomeworks) m.set(String(hw.id), hw.title);
    return m;
  }, [courseHomeworks]);
  // assignment_id → its homework title (for the per-row meta line).
  const hwTitleByAsgId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of courseAssignments) {
      if (a.homework_id == null) continue;
      const t = hwTitleById.get(String(a.homework_id));
      if (t) m.set(String(a.id), t);
    }
    return m;
  }, [courseAssignments, hwTitleById]);
  // Assignments belonging to the picked ДЗ (empty when no ДЗ picked).
  const homeworkAsgIds = useMemo(() => {
    if (!homework) return [] as string[];
    return courseAssignments
      .filter((a) => a.homework_id != null && String(a.homework_id) === homework)
      .map((a) => String(a.id));
  }, [homework, courseAssignments]);
  // Tasks within the picked ДЗ — the task picker's options.
  const homeworkAssignments = useMemo(() => {
    if (!homework) return [];
    return courseAssignments
      .filter((a) => a.homework_id != null && String(a.homework_id) === homework)
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [homework, courseAssignments]);
  // Effective assignment-id scope sent to the list + distribute:
  //   • a single task picked → just that id
  //   • a ДЗ picked (no task) → all its assignment ids
  //   • neither → undefined (whole course)
  const effectiveAsgIds = useMemo<string[]>(() => {
    if (assignment) return [assignment];
    if (homework) return homeworkAsgIds;
    return [];
  }, [assignment, homework, homeworkAsgIds]);

  // Distribute is a bulk write — open a richer dialog where the
  // teacher sets per-assistant weights (skip an assistant entirely by
  // setting weight=0, give a heavier load by setting >1, …) rather
  // than committing to a single equal split.
  const distribute = useDistributeSubmissions();
  const [distributeOpen, setDistributeOpen] = useState(false);
  const handleDistribute = async (
    graders: { id: string; name: string; weight: number }[],
  ) => {
    if (course === 'all' || graders.length === 0) return;
    try {
      // Scope: per-assignment when a ДЗ / task is picked (the backend's
      // :distribute takes exactly one assignment_id, so a multi-task ДЗ
      // fans out N parallel calls); otherwise distribute the whole
      // course at once.
      if (effectiveAsgIds.length > 0) {
        const results = await Promise.all(
          effectiveAsgIds.map((aid) =>
            distribute.mutateAsync({ assignment_id: aid, graders }),
          ),
        );
        const assigned = results.reduce((a, r) => a + r.assigned, 0);
        const skipped = results.reduce((a, r) => a + r.skipped, 0);
        const gradersCount = results[0]?.graders ?? graders.length;
        const scopeLabel = assignment
          ? asgTitleById.get(assignment) ?? 'задача'
          : hwTitleById.get(homework) ?? 'ДЗ';
        notify.success(
          `«${scopeLabel}»: распределено ${assigned} посылок между ${gradersCount} грейдерами` +
            (skipped > 0 ? ` (${skipped} уже были назначены)` : ''),
        );
      } else {
        const res = await distribute.mutateAsync({
          course_id: course,
          graders,
        });
        notify.success(
          `Распределено ${res.assigned} посылок между ${res.graders} грейдерами` +
            (res.skipped > 0 ? ` (${res.skipped} уже были назначены)` : ''),
        );
      }
      setDistributeOpen(false);
    } catch {
      notify.error('Не удалось распределить посылки');
      setDistributeOpen(false);
    }
  };

  const { data, isPending } = useMySubmissions({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    ...(course !== 'all' ? { course_id: course } : {}),
    ...(effectiveAsgIds.length > 0
      ? { assignment_ids: effectiveAsgIds }
      : {}),
    ...(isStaff && assignedFilter === 'mine' && user?.id
      ? { assigned_grader_id: user.id }
      : {}),
    // Staff triage queue counts distinct (assignment, student) pairs,
    // not raw version rows — v1/v2/v3 of the same submission collapse
    // into one row so the total doesn't lie by an order of magnitude.
    ...(isStaff ? { latest_per_student: true } : {}),
  });

  const all = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    return all.filter((s) => {
      if (filter !== 'all' && statusKey(s) !== filter) return false;
      return true;
    });
  }, [all, filter]);

  const statusItems: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'flagged', label: 'Помечено' },
    { id: 'running', label: 'Обработка' },
    { id: 'checked', label: 'Проверено' },
  ];

  return (
    <Page width="wide" data-testid="my-submissions-list">
      <PageHeader title={title} />

      {/* Controls row 1 — course picker + distribute action + count.
          Filter chips live on row 2 below, so this row stays thin and
          the chip-row reads as a separate, calmer surface. */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={coursePickerOpen} onOpenChange={setCoursePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={coursePickerOpen}
              className="h-9 min-w-[220px] justify-between"
              data-testid="my-submissions-course-picker"
            >
              <span className="truncate">
                {course === 'all'
                  ? 'Все курсы'
                  : selectedCourse?.name ?? 'Курс'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[280px] p-0"
            data-testid="my-submissions-course-picker-content"
          >
            <Command>
              <CommandInput placeholder="Найти курс…" />
              <CommandList>
                <CommandEmpty>Курсов нет.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      setCourse('all');
                      setCoursePickerOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        course === 'all' ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    Все курсы
                  </CommandItem>
                  {courseOptions.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.name}
                      onSelect={() => {
                        setCourse(c.id);
                        setCoursePickerOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          course === c.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* ДЗ picker — only once a concrete course is picked. Empty =
            «Все ДЗ курса». Picking a ДЗ narrows the list and scopes the
            distribute action. Same combobox style as the course picker
            so the control bar reads as one consistent surface. */}
        {isStaff && course !== 'all' && courseHomeworks.length > 0 && (
          <FilterCombo
            value={homework}
            onChange={setHomework}
            allLabel="Все ДЗ курса"
            searchPlaceholder="Найти ДЗ…"
            testId="my-submissions-hw-picker"
            options={courseHomeworks.map((hw) => ({
              value: String(hw.id),
              label: hw.title,
            }))}
          />
        )}

        {/* Task picker — only when a ДЗ with >1 task is picked. Empty =
            «Все задачи ДЗ». */}
        {isStaff && homework && homeworkAssignments.length > 1 && (
          <FilterCombo
            value={assignment}
            onChange={setAssignment}
            allLabel="Все задачи ДЗ"
            searchPlaceholder="Найти задачу…"
            testId="my-submissions-task-picker"
            options={homeworkAssignments.map((a) => ({
              value: String(a.id),
              label: a.title,
            }))}
          />
        )}

        <div className="flex-1" />

        {/* Distribute — needs a concrete course (so we know its
            assistants). Disabled with a hint when the course has none. */}
        {isStaff && course !== 'all' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDistributeOpen(true)}
            disabled={distribute.isPending || assistants.length === 0}
            title={
              assistants.length === 0
                ? 'В курсе нет грейдеров (преподавателей / ассистентов)'
                : effectiveAsgIds.length > 0
                  ? undefined
                  : 'Распределит все посылки курса. Выберите ДЗ выше, чтобы сузить.'
            }
            data-testid="submissions-distribute"
          >
            {distribute.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Распределить
          </Button>
        )}

        <span className="text-xs text-muted-foreground">
          {data?.pagination.total != null ? (
            <>
              <span className="font-medium text-foreground">
                {filtered.length}
              </span>{' '}
              из <span className="font-medium">{data.pagination.total}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {filtered.length}
              </span>{' '}
              из <span className="font-medium">{all.length}</span>
            </>
          )}
        </span>
      </div>

      {/* Row 2 — inline filter chips. Same chip language as
          SuspiciousPanel: label muted, options lowercase, active option
          font-medium foreground.  No underline-tab chrome. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <FilterGroup
          label="Статус"
          value={filter}
          onChange={(v) => setFilter(v as StatusFilter)}
          options={statusItems.map((s) => ({
            value: s.id,
            label: s.label.toLowerCase(),
          }))}
        />
        {isStaff && (
          <FilterGroup
            label="Исполнитель"
            value={assignedFilter}
            onChange={(v) => setAssignedFilter(v as 'all' | 'mine')}
            options={[
              { value: 'all', label: 'все' },
              { value: 'mine', label: 'только мои' },
            ]}
          />
        )}
      </div>

      <div>
        {isPending && all.length === 0 ? (
          <SkeletonList rows={4} rowHeight={56} />
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {assignedFilter === 'mine'
              ? 'На вас пока ничего не распределено.'
              : 'Посылок нет.'}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {filtered.map((s) => {
              const flagged = statusKey(s) === 'flagged';
              const running = statusKey(s) === 'running';
              // Prefer ФИО from the identity service over the
              // submission row's `author_label` / `author_id` (which is
              // often an external login like "hse-compsocsci-2543" for
              // YC-imported submissions).
              const fromMap = s.author_id
                ? nameById.get(s.author_id)
                : undefined;
              const studentName = fromMap ?? displayAuthor(s);
              const cLabel = s.course_id
                ? courseNameById.get(s.course_id) ?? null
                : null;
              // Task title (and its ДЗ) for the meta line — resolved
              // from the course's assignments. Only populated once a
              // course is picked (that's when we fetch assignments).
              const asgTitle = asgTitleById.get(String(s.assignment_id));
              const hwTitle = hwTitleByAsgId.get(String(s.assignment_id));
              return (
                <Link
                  key={s.id}
                  to={`/submissions/${s.id}`}
                  data-testid={`submission-table-row-${s.id}`}
                  className="group flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/30"
                >
                  <MiniAvatar name={studentName} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {studentName}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {asgTitle && (
                        <>
                          <span className="text-foreground/70">
                            {asgTitle}
                          </span>
                          {hwTitle && <> · {hwTitle}</>}
                          {' · '}
                        </>
                      )}
                      {!asgTitle && cLabel && <>{cLabel} · </>}
                      <span className="font-medium">v{s.version}</span> ·{' '}
                      {s.language}
                      {flagged && (
                        <>
                          {' · '}
                          <span className="text-sev-high">помечено</span>
                        </>
                      )}
                      {running && (
                        <>
                          {' · '}
                          <span className="text-primary">обработка</span>
                        </>
                      )}
                      {s.is_late && (
                        <>
                          {' · '}
                          <span className="text-sev-mid">
                            опоздание{s.late_kind === 'hard' ? ' (hard)' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {isStaff && s.assigned_grader_name && (
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                      <Users className="h-3 w-3" />
                      {s.assigned_grader_name}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.pagination.total ?? null}
          onPageChange={setPage}
        />
      </div>

      {/* Distribute dialog — per-assistant weights with a live
          preview. Set weight=0 to skip an assistant, >1 to give them
          a heavier share. */}
      <DistributeDialog
        open={distributeOpen}
        courseName={selectedCourse?.name ?? ''}
        assistants={assistants}
        pendingCount={
          (data?.pagination.total ?? all.length) -
          all.filter((s) => s.assigned_grader_name).length
        }
        busy={distribute.isPending}
        onClose={() => setDistributeOpen(false)}
        onSubmit={handleDistribute}
      />
    </Page>
  );
}

// Type re-export retained for downstream stories/tests that may import it.
export type { SubmissionStatus };

/* ----------------------------------------------------------------- */
/* Distribute dialog                                                  */
/*                                                                    */
/* Per-assistant weight inputs. The backend's allocator picks the     */
/* grader with the smallest `(count+1)/weight` at each step, so       */
/* weights are *relative* — set them all to 1 for an equal split,     */
/* bump one to 2 to give that assistant twice as many submissions,    */
/* set to 0 to skip an assistant entirely.                            */

interface DistributeDialogProps {
  open: boolean;
  courseName: string;
  assistants: { id: string; name: string }[];
  pendingCount: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (graders: { id: string; name: string; weight: number }[]) => void;
}

function DistributeDialog({
  open,
  courseName,
  assistants,
  pendingCount,
  busy,
  onClose,
  onSubmit,
}: DistributeDialogProps) {
  // SHARES, not independent weights — pulling one slider rebalances
  // the rest so the column always sums to 1 (or 0 if everyone is set
  // to «не берёт»). Mental model: a pie chart of work, drag a slice
  // to grow it and watch the others shrink in proportion.
  const [shares, setShares] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open || assistants.length === 0) return;
    const equal = 1 / assistants.length;
    const next: Record<string, number> = {};
    for (const a of assistants) next[a.id] = equal;
    setShares(next);
  }, [open, assistants]);

  /** Set assistant `id`'s share to `value` (0..1) and redistribute
   *  `1 - value` among the OTHER active assistants, preserving the
   *  ratios they currently have. If every other assistant was at 0,
   *  split the remainder equally. */
  const setShare = (id: string, raw: number) => {
    const clamped = Math.max(0, Math.min(1, raw));
    setShares((prev) => {
      const next: Record<string, number> = {};
      const others = assistants.filter((a) => a.id !== id);
      const otherTotal = others.reduce(
        (acc, a) => acc + (prev[a.id] ?? 0),
        0,
      );
      next[id] = clamped;
      const remaining = 1 - clamped;
      if (others.length === 0) return next;
      if (otherTotal > 0) {
        for (const a of others) {
          next[a.id] = ((prev[a.id] ?? 0) / otherTotal) * remaining;
        }
      } else {
        // The other sliders were all 0; split the remainder equally.
        const each = remaining / others.length;
        for (const a of others) next[a.id] = each;
      }
      return next;
    });
  };

  const activeAssistants = useMemo(
    () => assistants.filter((a) => (shares[a.id] ?? 0) > 0),
    [assistants, shares],
  );
  // Largest-remainder allocation gives integer counts that sum
  // exactly to pendingCount — better than naïve round() which can
  // be off by N. Cheap to recompute on every render (N ≤ ~10).
  const preview = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (pendingCount <= 0 || activeAssistants.length === 0) return counts;
    let assigned = 0;
    const remainders: { id: string; frac: number }[] = [];
    for (const a of activeAssistants) {
      const raw = (shares[a.id] ?? 0) * pendingCount;
      const floor = Math.floor(raw);
      counts[a.id] = floor;
      assigned += floor;
      remainders.push({ id: a.id, frac: raw - floor });
    }
    remainders.sort((x, y) => y.frac - x.frac);
    let i = 0;
    while (assigned < pendingCount && i < remainders.length) {
      counts[remainders[i].id] += 1;
      assigned += 1;
      i += 1;
    }
    return counts;
  }, [activeAssistants, shares, pendingCount]);

  const canSubmit = activeAssistants.length > 0 && !busy;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl" data-testid="distribute-dialog">
        <DialogHeader>
          <DialogTitle>Распределить между ассистентами</DialogTitle>
          {courseName && (
            <p className="text-sm text-muted-foreground truncate">
              {courseName}
            </p>
          )}
        </DialogHeader>
        {assistants.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            В курсе нет ассистентов.
          </p>
        ) : (
          <div className="space-y-1" data-testid="distribute-rows">
            {assistants.map((a) => {
              const share = shares[a.id] ?? 0;
              const skipped = share <= 0;
              const count = preview[a.id] ?? 0;
              return (
                <div
                  key={a.id}
                  data-testid={`distribute-row-${a.id}`}
                  className={cn(
                    'flex items-baseline gap-3 py-2.5',
                    skipped && 'opacity-60',
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="truncate text-sm font-medium text-foreground">
                        {a.name}
                      </div>
                      <span className="flex-none text-xs tabular-nums text-muted-foreground">
                        {skipped
                          ? 'не берёт'
                          : pendingCount > 0
                            ? `${count} · ${formatPct(share)}`
                            : formatPct(share)}
                      </span>
                    </div>
                    {/* Interconnected share slider — dragging one
                        rebalances the others so the column always
                        sums to 100 %. Drag the dot / click the track
                        / ← → keys all work. Move to 0 = «не берёт». */}
                    <ShareSlider
                      value={share}
                      onChange={(v) => setShare(a.id, v)}
                      skipped={skipped}
                      testId={`distribute-weight-${a.id}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {assistants.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Всего к распределению:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {pendingCount}
            </span>{' '}
            · уже распределённые посылки не затрагиваются.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            onClick={() =>
              // Shares already sum to 1; the backend's min-ratio
              // allocator treats `weight` as relative, so passing the
              // raw share is fine — proportional allocation is
              // identical to weight=share*N.
              onSubmit(
                activeAssistants.map((a) => ({
                  id: a.id,
                  name: a.name,
                  weight: shares[a.id] ?? 0,
                })),
              )
            }
            disabled={!canSubmit}
            data-testid="distribute-submit"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Распределить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Drag-able share slider. `value` is a fraction (0..1) of the total
 *  pie. Internally uses native `<input type="range">` at integer steps
 *  0..100 (percent) for keyboard + touch + accessibility; converts
 *  back to a fraction on change. Layered track + fill divs give the
 *  filled-bar look the native control can't do alone. */
function ShareSlider({
  value,
  onChange,
  skipped,
  testId,
}: {
  /** Fraction in 0..1. */
  value: number;
  /** Receives the new fraction (0..1). */
  onChange: (v: number) => void;
  skipped: boolean;
  testId?: string;
}) {
  const frac = Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
  const pct = Math.round(frac * 100);
  return (
    <div className="relative h-4 w-full" data-testid={testId}>
      {/* Track */}
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted/40" />
      {/* Fill — no width transition: when the user drags a sibling
          slider, this one rebalances at the same tempo as their cursor,
          so any easing lags visibly behind the thumb. */}
      <div
        className={cn(
          'absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full',
          skipped ? 'bg-muted-foreground/30' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
      {/* Native range — invisible track, custom thumb. */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
        aria-label="Доля"
        aria-valuetext={`${pct}%`}
        className={cn(
          'absolute inset-0 h-4 w-full cursor-pointer appearance-none bg-transparent focus:outline-none',
          '[&::-webkit-slider-runnable-track]:bg-transparent',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow',
          '[&::-moz-range-track]:bg-transparent',
          '[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-0',
        )}
      />
    </div>
  );
}

function formatPct(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return '0%';
  return `${Math.round(x * 100)}%`;
}
