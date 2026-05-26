/**
 * /integrations/yandex-contest/:configId/contests — manage Yandex.Contest
 * imports for the current teacher's OAuth-connected account.
 *
 * Y.Contest API doesn't expose ``GET /contests`` — the teacher must
 * know each contest_id ahead of time. PlagLens stores those IDs on
 * homework descriptions (``contest_id=NNNNN``). One OAuth token can
 * serve any number of courses, so this page:
 *
 *   1. Lists every homework across the teacher's courses that already
 *      has a contest_id in its description (= "Привязанные контесты").
 *   2. Lets the teacher add a new binding: pick course + give the
 *      homework a name + paste the Y.Contest contest_id. We POST to
 *      /courses/:id/homeworks with a description containing the magic
 *      ``contest_id=NNNNN`` marker — the next autosync tick + the
 *      import buttons pick it up.
 *   3. Per row: "Импортировать участников", "Импортировать посылки",
 *      "Отвязать" (delete homework).
 *
 * UI rules (.claude/UI_RULES.md): no Card chrome, only hairline dividers
 * between rows. The earlier "Card with grey fill" version read as
 * unrelated stacked boxes.
 */
import { FormEvent, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Page } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { integrationsApi } from '@/api/endpoints/integrations';
import { useIntegration } from '@/hooks/api/useIntegrations';
import { homeworksApi } from '@/api/endpoints/homeworks';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/components/ui/utils';
import type { Problem } from '@/api/types';

interface ImportSummary {
  imported: number;
  failed: number;
  errors: string[];
  identity?: { created: number; existing: number };
  course?: {
    added: number;
    existing: number;
    failed: number;
    error?: string;
  };
}

interface SubmissionsSummary {
  fetched: number;
  failed: number;
  errors: string[];
  cursor: Record<string, unknown>;
  note?: string;
}

const CONTEST_ID_RE = /contest_id\s*=\s*(\d+)/i;

function extractContestId(description?: string | null): number | null {
  if (!description) return null;
  const m = description.match(CONTEST_ID_RE);
  return m ? Number(m[1]) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Course = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Homework = any;

interface BoundContest {
  hw: Homework;
  course: Course;
  contestId: number;
}

export default function YandexContestImportPage() {
  useDocumentTitle('Импорт из Yandex.Contest');
  const { configId } = useParams<{ configId: string }>();
  const notify = useNotifications();
  const queryClient = useQueryClient();

  const cfgQ = useIntegration(configId);

  // All courses where the current user is owner/teacher — the OAuth
  // token serves any of them, so we fan out homework queries across
  // the whole set.
  const myCoursesQ = useMyCourses();
  const courses: Course[] = Array.isArray(myCoursesQ.data)
    ? (myCoursesQ.data as Course[])
    : ((myCoursesQ.data as { data?: Course[] } | undefined)?.data ?? []);

  const hwQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-homeworks', String(c.id)],
      queryFn: () => homeworksApi.listForCourse(String(c.id), { limit: 200 }),
      enabled: !!c.id,
    })),
  });

  const bound: BoundContest[] = useMemo(() => {
    const out: BoundContest[] = [];
    courses.forEach((c, idx) => {
      const list = hwQueries[idx]?.data?.data ?? [];
      for (const hw of list) {
        const cid = extractContestId(hw.description);
        if (cid !== null) {
          out.push({ hw, course: c, contestId: cid });
        }
      }
    });
    return out;
  }, [courses, hwQueries]);

  const isInitialLoad =
    myCoursesQ.isPending ||
    (courses.length > 0 && hwQueries.some((q) => q.isPending));

  // -------- import actions --------
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportSummary>>({});
  const [subResults, setSubResults] = useState<
    Record<string, SubmissionsSummary>
  >({});

  const onImport = async (
    contestId: number,
    key: string,
    courseId?: string,
    homeworkId?: string,
  ) => {
    if (!configId) return;
    setBusyId(key);
    try {
      const res = await integrationsApi.ycImportParticipants(
        configId,
        contestId,
        { course_id: courseId, homework_id: homeworkId },
      );
      setResults((p) => ({ ...p, [key]: res }));
      // Backend will rename the homework + add students to course; pull
      // homework list so the UI catches the new title without manual reload.
      if (courseId) {
        queryClient.invalidateQueries({
          queryKey: ['course-homeworks', courseId],
        });
      }
    } catch (raw) {
      const p = raw as Problem;
      setResults((prev) => ({
        ...prev,
        [key]: {
          imported: 0,
          failed: 1,
          errors: [p.detail ?? p.title ?? 'Ошибка импорта'],
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  const onImportSubmissions = async (contestId: number, key: string) => {
    if (!configId) return;
    setBusyId(`sub-${key}`);
    try {
      const res = await integrationsApi.ycImportSubmissions(configId, contestId);
      setSubResults((p) => ({ ...p, [key]: res }));
    } catch (raw) {
      const p = raw as Problem;
      setSubResults((prev) => ({
        ...prev,
        [key]: {
          fetched: 0,
          failed: 1,
          errors: [p.detail ?? p.title ?? 'Ошибка импорта'],
          cursor: {},
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  // -------- delete binding --------
  const deleteHwM = useMutation({
    mutationFn: (hwId: string) => homeworksApi.delete(hwId),
    onSuccess: () => {
      notify.success('Привязка снята');
      courses.forEach((c) =>
        queryClient.invalidateQueries({
          queryKey: ['course-homeworks', String(c.id)],
        }),
      );
    },
    onError: (e) =>
      notify.error(
        (e as unknown as Problem)?.detail ?? 'Не удалось снять привязку',
      ),
  });

  const onUnbind = (hw: Homework) => {
    if (!confirm(`Отвязать «${hw.title}»? Связь с Yandex.Contest пропадёт.`))
      return;
    deleteHwM.mutate(String(hw.id));
  };

  // -------- add binding --------
  // No "Название ДЗ" input: it's reachable info on Y.Contest's side
  // (GET /v2/contests/<id> returns ``name``). We seed the homework
  // with a placeholder title ("Контест #NNNNN") and let the first
  // import-participants tick rename it to the real contest name —
  // simpler than blocking the form on an extra Y.Contest call before
  // the user even hit "Привязать".
  const [newCourseId, setNewCourseId] = useState<string>('');
  const [newContestId, setNewContestId] = useState('');
  const addM = useMutation({
    mutationFn: async () => {
      const cid = Number(newContestId.trim());
      if (!newCourseId) throw new Error('Выберите курс');
      if (!cid) throw new Error('ID контеста должен быть числом');
      return homeworksApi.create(newCourseId, {
        title: `Контест #${cid}`,
        // Magic marker the importer + autosync read.
        description: `Yandex.Contest contest_id=${cid}`,
      });
    },
    onSuccess: () => {
      notify.success('Контест привязан');
      setNewContestId('');
      queryClient.invalidateQueries({
        queryKey: ['course-homeworks', newCourseId],
      });
    },
    onError: (e) =>
      notify.error(
        (e as unknown as Problem)?.detail ??
          (e as Error)?.message ??
          'Не удалось привязать',
      ),
  });

  const onAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    addM.mutate();
  };

  return (
    <Page width="regular">
      <h1 className="text-2xl font-semibold tracking-tight">
        Импорт из Yandex.Contest
      </h1>

      {/* Autosync row */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Автосинхронизация
        </h2>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            каждые 5 минут
          </div>
          {configId && <ManualSyncButton configId={configId} />}
        </div>
      </section>

      {/* Bound contests */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Привязанные контесты
        </h2>

        {isInitialLoad ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загружаем привязки…
          </div>
        ) : bound.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока ни один контест не привязан. Добавьте первый ниже.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {bound.map(({ hw, course, contestId }) => {
              const key = `hw-${hw.id}`;
              const r = results[key];
              const sub = subResults[key];
              const dueAt = hw.due_at
                ? dayjs(hw.due_at).format('D MMMM YYYY')
                : null;
              return (
                <li
                  key={hw.id}
                  className="flex flex-col gap-3 py-4"
                  data-testid={`yc-hw-${hw.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {hw.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {course.name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <a
                          href={`https://contest.yandex.ru/contest/${contestId}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-foreground/80 hover:underline"
                        >
                          contest #{contestId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {dueAt && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            до {dueAt}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() =>
                          onImport(
                            contestId,
                            key,
                            String(course.id),
                            String(hw.id),
                          )
                        }
                        disabled={busyId === key}
                        data-testid={`yc-import-hw-${hw.id}`}
                      >
                        <Users className="mr-1.5 h-3.5 w-3.5" />
                        {busyId === key ? 'Студенты…' : 'Студенты'}
                      </Button>
                      {/* Submission import requires a per-problem
                          assignment binding (Y.Contest gives runs per
                          contest+problem; submission-service needs an
                          assignment_id target). The mapping UI for that
                          isn't wired yet — temporarily hidden so the
                          button doesn't surface a 400 to the user.
                          Hidden via display:none rather than ripped out
                          so re-enabling is a one-line revert when the
                          mapping ships. */}
                      <button hidden onClick={() => onImportSubmissions(contestId, key)} />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => onUnbind(hw)}
                        disabled={deleteHwM.isPending}
                        data-testid={`yc-delete-hw-${hw.id}`}
                        title="Отвязать"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {r && <ResultLine r={r} />}
                  {sub && <SubLine s={sub} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Add binding */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Привязать контест
        </h2>
        <form
          onSubmit={onAddSubmit}
          className="flex flex-wrap items-end gap-3"
          data-testid="yc-add-binding-form"
        >
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label htmlFor="yc-add-course">Курс</Label>
            <Select value={newCourseId} onValueChange={setNewCourseId}>
              <SelectTrigger id="yc-add-course" data-testid="yc-add-course">
                <SelectValue placeholder="Выберите курс" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32 space-y-1.5">
            <Label htmlFor="yc-add-contest-id">ID контеста</Label>
            <Input
              id="yc-add-contest-id"
              value={newContestId}
              onChange={(e) => setNewContestId(e.currentTarget.value)}
              placeholder="73433"
              inputMode="numeric"
              pattern="[0-9]+"
              className="font-mono"
              data-testid="yc-add-contest-id"
            />
          </div>
          <Button
            type="submit"
            disabled={
              addM.isPending || !newCourseId || !newContestId.trim()
            }
            data-testid="yc-add-submit"
          >
            {addM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Привязать
          </Button>
        </form>
      </section>

      {configId && <SyncHistorySection configId={configId} />}

      {/* Suppress unused import when cfg load races — keeps cfgQ in the
          dependency graph so refetches still tick after revoke flows. */}
      {cfgQ.isError && (
        <p className="text-xs text-destructive">
          Не удалось загрузить интеграцию.
        </p>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */

function ManualSyncButton({ configId }: { configId: string }) {
  const notify = useNotifications();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await integrationsApi.syncNow(configId, {});
      notify.success('Запустили синхронизацию');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={run}
      disabled={busy}
      data-testid="yc-manual-sync"
    >
      {busy ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
      )}
      Запустить сейчас
    </Button>
  );
}

function ResultLine({ r }: { r: ImportSummary }) {
  const ok = r.imported > 0 && r.failed === 0;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs',
        ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
      )}
      <span>
        импортировано {r.imported}, ошибок {r.failed}
        {r.identity && (
          <>
            {' '}
            · идентичности: создано {r.identity.created} / найдено{' '}
            {r.identity.existing}
          </>
        )}
        {r.course && (
          <>
            {' '}
            · в курс добавлено {r.course.added}, уже было{' '}
            {r.course.existing}
          </>
        )}
      </span>
      {r.errors.length > 0 && (
        <span className="text-destructive">— {r.errors[0]}</span>
      )}
    </div>
  );
}

function SubLine({ s }: { s: SubmissionsSummary }) {
  const ok = s.fetched > 0 && s.failed === 0;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs',
        ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
      )}
      <span>
        посылок получено {s.fetched}, ошибок {s.failed}
      </span>
      {s.note && <span className="text-muted-foreground">— {s.note}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sync history — collapsed to a flat list, no Card wrapper            */

function SyncHistorySection({ configId }: { configId: string }) {
  const q = useQueries({
    queries: [
      {
        queryKey: ['integration', configId, 'jobs', { limit: 5 }],
        queryFn: () => integrationsApi.listImportJobs(configId, { limit: 5 }),
        enabled: !!configId,
        refetchInterval: 15_000,
      },
    ],
  });
  const data = q[0]?.data?.data ?? [];
  if (data.length === 0) return null;

  return (
    <section className="space-y-3 border-t border-border/50 pt-6">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        История синхронизаций
      </h2>
      <ul className="divide-y divide-border/40">
        {data.map((j) => {
          const at = j.started_at ?? j.finished_at;
          return (
            <li
              key={j.id}
              className="flex items-center justify-between gap-3 py-2 text-xs"
            >
              <span className="flex items-center gap-2">
                {j.status === 'completed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : j.status === 'failed' ? (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span className="font-mono text-muted-foreground">
                  {j.status}
                </span>
              </span>
              <span className="text-muted-foreground">
                {at ? dayjs(at).format('D MMM, HH:mm') : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
