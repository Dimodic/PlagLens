/**
 * /integrations/:id — Y.Contest integration detail.
 *
 * Layout follows .claude/UI_RULES.md (flat open document, no Card
 * chrome). Earlier iterations had a free-form name field, raw cron
 * input, and a separate disconnect button — all noise for the teacher.
 * Current shape:
 *
 *   header  ──  «Синхронизировать всё» (primary) + kebab «…»
 *               ├─ Пройти авторизацию заново
 *               └─ Отключить интеграцию
 *
 *   §1 Автосинхронизация
 *       Toggle  «Включена» + numeric «Каждые N часов» (1-24)
 *
 *   §2 Курсы и задания
 *       <Select course> → list of YC-imported homeworks
 *           each row: [✓ авто] · title · «Синхронизировать сейчас»
 *
 *   §3 История синхронизаций
 *
 * Backend storage for §1/§2 lives on the integration's settings JSON:
 *   settings.autosync = { enabled: bool, hours: number, homework_ids: string[] }
 *   settings.imported_contests = { "<course>:<contest>": "<homework_id>" }
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDeleteIntegration,
  useImportJobs,
  useIntegration,
  useOauthStartIntegration,
  useSyncNow,
  useUpdateIntegration,
} from '@/hooks/api/useIntegrations';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { integrationsApi } from '@/api/endpoints/integrations';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tokenStore } from '@/api/client';
import { integrationKeys } from '@/hooks/api/useIntegrations';
import type { Problem } from '@/api/types';

interface AutosyncPrefs {
  enabled: boolean;
  hours: number;
  homework_ids: string[];
}

const DEFAULT_AUTOSYNC: AutosyncPrefs = {
  enabled: true,
  hours: 6,
  homework_ids: [],
};

function readAutosync(settings: Record<string, unknown> | undefined): AutosyncPrefs {
  const raw = (settings ?? {})['autosync'] as Partial<AutosyncPrefs> | undefined;
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULT_AUTOSYNC.enabled,
    hours: typeof raw?.hours === 'number' && raw.hours >= 1 && raw.hours <= 24
      ? Math.floor(raw.hours)
      : DEFAULT_AUTOSYNC.hours,
    homework_ids: Array.isArray(raw?.homework_ids)
      ? raw!.homework_ids!.map((x) => String(x))
      : DEFAULT_AUTOSYNC.homework_ids,
  };
}

interface ImportedEntry {
  courseKey: string; // course_id as written in the mapping ("*" if legacy)
  contestId: number;
  homeworkId: string;
}

function readImportedContests(
  settings: Record<string, unknown> | undefined,
): ImportedEntry[] {
  const raw = (settings ?? {})['imported_contests'] as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== 'object') return [];
  const out: ImportedEntry[] = [];
  for (const [k, v] of Object.entries(raw)) {
    let courseKey: string;
    let contestPart: string;
    if (k.includes(':')) {
      const [cp, cnp] = k.split(':', 2);
      courseKey = cp;
      contestPart = cnp;
    } else {
      // Legacy unscoped mapping — single-course configs from before we
      // started scoping by course_id. Treat as "any course".
      courseKey = '*';
      contestPart = k;
    }
    const contestId = parseInt(contestPart, 10);
    if (!Number.isFinite(contestId)) continue;
    out.push({ courseKey, contestId, homeworkId: String(v) });
  }
  return out;
}

export function IntegrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Интеграция');
  const notify = useNotifications();
  const navigate = useNavigate();

  const integrationQ = useIntegration(id);
  const jobsQ = useImportJobs(id, { limit: 10 });
  const update = useUpdateIntegration(id ?? '');
  const syncAll = useSyncNow(id ?? '');
  const oauth = useOauthStartIntegration();
  const remove = useDeleteIntegration();
  const coursesQ = useMyCourses();

  if (integrationQ.isLoading) {
    return (
      <Page width="regular">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Page>
    );
  }
  if (integrationQ.error) {
    return (
      <Page width="regular">
        <ProblemAlert problem={integrationQ.error as unknown as Problem} />
      </Page>
    );
  }

  const i = integrationQ.data;
  if (!i) return null;
  return (
    <IntegrationDetail
      i={i}
      jobs={jobsQ.data?.data ?? []}
      jobsLoading={jobsQ.isLoading}
      refetchJobs={() => void jobsQ.refetch()}
      onUpdate={update}
      onSyncAll={syncAll}
      onOauth={oauth}
      onRemove={remove}
      coursesData={coursesQ.data?.data ?? []}
      notify={notify}
      navigate={navigate}
    />
  );
}

interface DetailProps {
  i: NonNullable<ReturnType<typeof useIntegration>['data']>;
  jobs: NonNullable<ReturnType<typeof useImportJobs>['data']>['data'];
  jobsLoading: boolean;
  refetchJobs: () => void;
  onUpdate: ReturnType<typeof useUpdateIntegration>;
  onSyncAll: ReturnType<typeof useSyncNow>;
  onOauth: ReturnType<typeof useOauthStartIntegration>;
  onRemove: ReturnType<typeof useDeleteIntegration>;
  coursesData: ReturnType<typeof useMyCourses>['data'] extends infer T
    ? T extends { data: infer D }
      ? D
      : never[]
    : never[];
  notify: ReturnType<typeof useNotifications>;
  navigate: ReturnType<typeof useNavigate>;
}

interface JobProgress {
  id?: string;
  stage?: string;
  homework_idx?: number;
  homework_total?: number;
  homework_title?: string | null;
  current_contest_id?: number;
  submissions_imported?: number;
}

function IntegrationDetail(props: DetailProps) {
  const {
    i,
    jobs,
    jobsLoading,
    refetchJobs,
    onUpdate,
    onSyncAll,
    onOauth,
    onRemove,
    coursesData,
    notify,
    navigate,
  } = props;
  const qc = useQueryClient();

  const settings = (i.settings ?? {}) as Record<string, unknown>;
  const autosync = useMemo(() => readAutosync(settings), [settings]);
  const imported = useMemo(() => readImportedContests(settings), [settings]);

  // Group imports by course_id so we can both (a) populate the course
  // picker with only courses that have at least one imported contest
  // and (b) hand the homework_ids list to the per-course filter.
  const importsByCourse = useMemo(() => {
    const out = new Map<string, ImportedEntry[]>();
    for (const e of imported) {
      const arr = out.get(e.courseKey) ?? [];
      arr.push(e);
      out.set(e.courseKey, arr);
    }
    return out;
  }, [imported]);

  const courseOptions = useMemo(() => {
    return coursesData.filter((c) => importsByCourse.has(String(c.id)));
  }, [coursesData, importsByCourse]);

  // Course picker — default to the first option that actually has
  // imports, or the first imported courseKey if user has no course
  // membership data yet.
  const firstCourseKey = courseOptions[0]?.id
    ? String(courseOptions[0].id)
    : [...importsByCourse.keys()].find((k) => k !== '*');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    firstCourseKey ?? null,
  );
  useEffect(() => {
    if (!selectedCourseId && firstCourseKey) setSelectedCourseId(firstCourseKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstCourseKey]);

  const homeworksQ = useHomeworksForCourse(
    selectedCourseId ?? undefined,
    { limit: 200 },
  );

  // ---- Live progress over SSE for the topmost running job ----
  // EventSource can't set headers, so the gateway accepts the token
  // as a ``?access_token=`` query param on this whitelisted path.
  const runningJob = useMemo(
    () => jobs.find((j) => j.status === 'running' || j.status === 'queued'),
    [jobs],
  );
  const [liveProgress, setLiveProgress] = useState<JobProgress | null>(null);
  const lastJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    const jobId = runningJob?.id ?? null;
    // Reset progress whenever the active job changes (or goes away).
    if (lastJobIdRef.current !== jobId) {
      lastJobIdRef.current = jobId;
      setLiveProgress(null);
    }
    if (!jobId || typeof EventSource === 'undefined') return;
    const token = tokenStore.get();
    if (!token) return;
    const url = integrationsApi.jobEventsUrl(i.id, jobId, token);
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener('progress', (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as {
          id?: string;
          status?: string;
          progress?: JobProgress;
        };
        setLiveProgress({ id: payload.id, ...(payload.progress ?? {}) });
      } catch {
        /* noise */
      }
    });
    es.addEventListener('done', () => {
      es.close();
      // Final state landed — pull the row freshly so stats/error display.
      void qc.invalidateQueries({
        queryKey: integrationKeys.importJobs(i.id, { limit: 10 }),
      });
    });
    es.addEventListener('error', () => {
      // EventSource will auto-retry; we just stop showing stale data
      // if the connection collapses. The query refetch on tab focus /
      // visibility change covers reconciliation.
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningJob?.id, i.id]);
  // Filter homeworks to those imported by this integration on the
  // selected course. The map's value is the homework_id we recorded
  // at import time.
  const courseImports = selectedCourseId
    ? importsByCourse.get(selectedCourseId) ?? []
    : [];
  const importedHwIds = useMemo(
    () => new Set(courseImports.map((e) => e.homeworkId)),
    [courseImports],
  );
  const homeworks = useMemo(() => {
    const all = homeworksQ.data?.data ?? [];
    return all
      .filter((h) => importedHwIds.has(String(h.id)))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [homeworksQ.data, importedHwIds]);

  // Per-homework sync — uses the existing ycImportAsHomework endpoint
  // which auto-takes the resync path when a homework already exists.
  const [syncingHwId, setSyncingHwId] = useState<string | null>(null);
  const syncOneMut = useMutation({
    mutationFn: async (vars: { contestId: number; courseId: string }) => {
      return integrationsApi.ycImportAsHomework(
        i.id,
        vars.contestId,
        vars.courseId,
      );
    },
  });

  const isPendingAuth = i.status === 'pending_auth';

  // ---- Settings mutations (single update queue so toggles don't race) ----
  const saveSettings = async (next: AutosyncPrefs) => {
    try {
      await onUpdate.mutateAsync({
        settings: { ...settings, autosync: next },
      });
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось сохранить');
    }
  };

  const setAutosyncEnabled = (enabled: boolean) =>
    saveSettings({ ...autosync, enabled });
  const setAutosyncHours = (hours: number) =>
    saveSettings({ ...autosync, hours: Math.min(24, Math.max(1, hours)) });
  const toggleHomeworkAuto = (hwId: string) => {
    const set = new Set(autosync.homework_ids);
    if (set.has(hwId)) set.delete(hwId);
    else set.add(hwId);
    void saveSettings({ ...autosync, homework_ids: [...set] });
  };

  // ---- Header actions ----
  const onClickSyncAll = async () => {
    try {
      await onSyncAll.mutateAsync({});
      notify.success('Синхронизация запущена');
      refetchJobs();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };
  const onReauth = async () => {
    try {
      const r = await onOauth.mutateAsync(i.id);
      window.location.href = r.authorize_url;
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };
  const onDisconnect = async () => {
    if (
      !confirm(
        `Отключить интеграцию «${i.display_name}»?\nСвязанные ДЗ останутся в курсе, но импорт прекратится.`,
      )
    ) {
      return;
    }
    try {
      await onRemove.mutateAsync(i.id);
      notify.success('Интеграция отключена');
      navigate('/integrations');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  // ---- Per-homework manual sync ----
  const onSyncHomework = async (entry: ImportedEntry, hwTitle: string) => {
    const courseId = selectedCourseId;
    if (!courseId) return;
    setSyncingHwId(entry.homeworkId);
    try {
      await syncOneMut.mutateAsync({
        contestId: entry.contestId,
        courseId,
      });
      notify.success(`«${hwTitle}» — синхронизация запущена`);
      refetchJobs();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setSyncingHwId(null);
    }
  };

  return (
    <Page width="regular">
      <PageHeader
        title={
          <span data-testid="integration-detail-title">{i.display_name}</span>
        }
        action={
          <>
            <Button
              onClick={onClickSyncAll}
              disabled={onSyncAll.isPending || isPendingAuth}
              data-testid="integration-detail-sync"
            >
              {onSyncAll.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Синхронизировать всё
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Ещё"
                  data-testid="integration-detail-menu"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => void onReauth()}
                  data-testid="integration-detail-reauth"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Пройти авторизацию заново
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void onDisconnect()}
                  className="text-destructive focus:text-destructive"
                  data-testid="integration-detail-disconnect"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Отключить интеграцию
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {isPendingAuth && (
        <div className="flex items-start gap-3 border-t border-border/50 pt-6 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-500" />
          <p>
            Подключение требует авторизации — откройте меню «…» → «Пройти
            авторизацию заново». Без неё импорт работать не будет.
          </p>
        </div>
      )}

      {/* §1 Автосинхронизация */}
      <section className="space-y-4 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Автосинхронизация
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="autosync-enabled"
              checked={autosync.enabled}
              onCheckedChange={setAutosyncEnabled}
              disabled={onUpdate.isPending}
            />
            <Label htmlFor="autosync-enabled" className="text-sm">
              Включена
            </Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={autosync.enabled ? '' : 'text-muted-foreground/60'}>
              каждые
            </span>
            <Input
              type="number"
              min={1}
              max={24}
              value={autosync.hours}
              onChange={(e) => {
                const n = parseInt(e.currentTarget.value, 10);
                if (Number.isFinite(n)) setAutosyncHours(n);
              }}
              disabled={!autosync.enabled || onUpdate.isPending}
              className="h-8 w-16 text-center tabular-nums"
              data-testid="integration-autosync-hours"
            />
            <span className={autosync.enabled ? '' : 'text-muted-foreground/60'}>
              {pluralHours(autosync.hours)}
            </span>
          </div>
        </div>
      </section>

      {/* §2 Курсы и задания */}
      <section className="space-y-4 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Курсы и задания
        </h2>

        {courseOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока ничего не импортировано. Откройте курс и добавьте новое ДЗ
            «Из Yandex.Contest».
          </p>
        ) : (
          <>
            <div className="max-w-md">
              <Label className="text-xs text-muted-foreground">Курс</Label>
              <Select
                value={selectedCourseId ?? undefined}
                onValueChange={(v) => setSelectedCourseId(v)}
              >
                <SelectTrigger
                  className="mt-1"
                  data-testid="integration-course-select"
                >
                  <SelectValue placeholder="Выберите курс" />
                </SelectTrigger>
                <SelectContent>
                  {courseOptions.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 pt-2">
              {homeworksQ.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Загружаем задания…
                </div>
              ) : homeworks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  В выбранном курсе нет YC-импортированных ДЗ.
                </p>
              ) : (
                <ul
                  className="divide-y divide-border/40"
                  data-testid="integration-homework-list"
                >
                  {homeworks.map((hw) => {
                    const entry = courseImports.find(
                      (e) => e.homeworkId === String(hw.id),
                    );
                    if (!entry) return null;
                    const checked = autosync.homework_ids.includes(
                      String(hw.id),
                    );
                    const busy = syncingHwId === String(hw.id);
                    return (
                      <li
                        key={hw.id}
                        className="flex items-center gap-3 py-2.5"
                        data-testid={`integration-hw-row-${hw.id}`}
                      >
                        <Checkbox
                          id={`hw-${hw.id}`}
                          checked={checked}
                          onCheckedChange={() =>
                            toggleHomeworkAuto(String(hw.id))
                          }
                          disabled={!autosync.enabled || onUpdate.isPending}
                          aria-label="Авто-синхронизация"
                        />
                        <Label
                          htmlFor={`hw-${hw.id}`}
                          className="flex-1 cursor-pointer truncate text-sm"
                        >
                          {hw.title}
                          <span className="ml-2 text-xs text-muted-foreground/70">
                            · контест {entry.contestId}
                          </span>
                        </Label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void onSyncHomework(entry, hw.title)}
                          disabled={busy || isPendingAuth}
                          data-testid={`integration-hw-sync-${hw.id}`}
                        >
                          {busy ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          )}
                          Синхронизировать
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* §3 История синхронизаций */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          История синхронизаций
        </h2>

        {jobsLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загружаем…
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Импортов ещё не было.</p>
        ) : (
          <ul
            className="divide-y divide-border/40"
            data-testid="integration-detail-jobs"
          >
            {jobs.map((j) => {
              const at = j.started_at ?? j.finished_at;
              const isRunning =
                j.status === 'running' || j.status === 'queued';
              const progress =
                isRunning && liveProgress?.id === j.id
                  ? liveProgress
                  : isRunning
                    ? ((j.progress ?? {}) as JobProgress)
                    : null;
              return (
                <li
                  key={j.id}
                  className="space-y-0.5 py-2.5 text-sm"
                  data-testid={`job-${j.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      {j.status === 'completed' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : j.status === 'failed' ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      <span className="text-foreground">
                        {jobStatusLabel(j.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {triggerLabel(j.trigger)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {at ? dayjs(at).format('D MMM, HH:mm') : 'в очереди'}
                    </span>
                  </div>
                  {progress && (
                    <p className="pl-5 text-xs text-muted-foreground">
                      {formatProgress(progress)}
                    </p>
                  )}
                  {!isRunning && j.stats && (
                    <p className="pl-5 text-xs text-muted-foreground">
                      {/* Show error count only when the run actually
                         failed. Dolos / dedup noise during a successful
                         resync would otherwise stamp a confusing
                         «ошибок N» on a green check. */}
                      импортировано {j.stats.imported}
                      {j.status === 'failed' && (
                        <> · ошибок {j.stats.failed}</>
                      )}
                    </p>
                  )}
                  {!isRunning && j.error && j.status === 'failed' && (
                    <p className="pl-5 text-xs text-destructive">
                      {j.error.title ?? 'ошибка'}
                      {j.error.detail ? `: ${j.error.detail}` : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}

function jobStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'успешно';
    case 'failed':
      return 'ошибка';
    case 'running':
      return 'в работе';
    case 'queued':
      return 'в очереди';
    case 'cancelled':
      return 'отменено';
    default:
      return status;
  }
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'manual':
      return 'вручную';
    case 'scheduled':
      return 'по расписанию';
    case 'webhook':
      return 'веб-хук';
    default:
      return trigger;
  }
}

function formatProgress(p: JobProgress): string {
  // Compose the live-progress line: "ДЗ 2/3 «Имя» · посылок 384".
  // Field availability depends on which checkpoint the worker has
  // reached, so we degrade gracefully.
  const parts: string[] = [];
  if (typeof p.homework_idx === 'number' && typeof p.homework_total === 'number') {
    const title = p.homework_title ? ` «${p.homework_title}»` : '';
    parts.push(`ДЗ ${p.homework_idx}/${p.homework_total}${title}`);
  } else if (p.homework_title) {
    parts.push(`«${p.homework_title}»`);
  }
  if (typeof p.submissions_imported === 'number' && p.submissions_imported > 0) {
    parts.push(`посылок ${p.submissions_imported}`);
  }
  if (parts.length === 0) {
    // Fallback when worker hasn't ticked yet (or job is plain queued).
    const stage = p.stage ?? 'starting';
    return stageLabel(stage);
  }
  return parts.join(' · ');
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'starting':
      return 'подготовка';
    case 'loading_homework':
      return 'загрузка ДЗ';
    case 'fetching_submissions':
      return 'выкачиваем посылки';
    case 'importing_submissions':
      return 'импортируем посылки';
    case 'homework_done':
      return 'ДЗ обработано';
    case 'done':
      return 'готово';
    default:
      return stage;
  }
}

function pluralHours(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'часов';
  if (mod10 === 1) return 'час';
  if (mod10 >= 2 && mod10 <= 4) return 'часа';
  return 'часов';
}

export default IntegrationDetailPage;
