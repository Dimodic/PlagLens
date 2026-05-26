/**
 * /integrations/:id (also mounted as /admin/integrations/:id).
 *
 * Flat open-document layout per .claude/UI_RULES.md. Earlier iterations
 * leaned heavily on Card wrappers + tabs + raw kind-specific edit form
 * (oauth_token, contest_ids, course_id) — but those are admin-side
 * debug surfaces. For a teacher all that matters is:
 *
 *   1. What this integration is — header reads ``display_name`` only,
 *      no ``kind``/``status`` chips next to it.
 *   2. Rename it (inline form).
 *   3. Run a manual sync.
 *   4. See recent sync history.
 *   5. Set up automatic sync schedules.
 *   6. Disconnect / re-authorise if OAuth expired.
 *
 * Cursor state + kind-specific settings are gone from this page; they
 * still live on the backend and can be inspected from the audit log if
 * needed.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useCreateSchedule,
  useDeleteIntegration,
  useDeleteSchedule,
  useImportJobs,
  useIntegration,
  useOauthStartIntegration,
  useSchedules,
  useSyncNow,
  useTestIntegration,
  useUpdateIntegration,
} from '@/hooks/api/useIntegrations';
import type { Problem } from '@/api/types';

export function IntegrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Интеграция');
  const notify = useNotifications();
  const navigate = useNavigate();

  const integrationQ = useIntegration(id);
  const schedulesQ = useSchedules(id);
  const jobsQ = useImportJobs(id, { limit: 10 });
  const update = useUpdateIntegration(id ?? '');
  const test = useTestIntegration();
  const sync = useSyncNow(id ?? '');
  const oauth = useOauthStartIntegration();
  const remove = useDeleteIntegration();
  const createSchedule = useCreateSchedule(id ?? '');
  const deleteSchedule = useDeleteSchedule(id ?? '');

  const [displayName, setDisplayName] = useState('');
  const [cron, setCron] = useState('0 */6 * * *');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  useEffect(() => {
    if (integrationQ.data) {
      setDisplayName(integrationQ.data.display_name);
    }
  }, [integrationQ.data]);

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

  const dirtyName = displayName.trim() !== i.display_name && !!displayName.trim();
  const isPendingAuth = i.status === 'pending_auth';

  const onSaveName = async () => {
    try {
      await update.mutateAsync({ display_name: displayName.trim() });
      notify.success('Сохранено');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onTest = async () => {
    try {
      const r = await test.mutateAsync(i.id);
      const why = r.detail ?? r.message;
      if (r.ok) {
        notify.success(
          `Подключение работает${r.latency_ms ? ` · ${r.latency_ms} мс` : ''}`,
        );
      } else {
        notify.error(why ? `Не отвечает: ${why}` : 'Не отвечает');
      }
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onSync = async () => {
    try {
      await sync.mutateAsync({});
      notify.success('Синхронизация запущена');
      jobsQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onReauth = async () => {
    try {
      const r = await oauth.mutateAsync(i.id);
      window.location.href = r.authorize_url;
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onAddSchedule = async () => {
    try {
      await createSchedule.mutateAsync({ cron, enabled: scheduleEnabled });
      notify.success('Расписание добавлено');
      setCron('0 */6 * * *');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onDeleteSchedule = async (sid: string) => {
    try {
      await deleteSchedule.mutateAsync(sid);
      notify.success('Удалено');
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
      await remove.mutateAsync(i.id);
      notify.success('Интеграция отключена');
      navigate('/integrations');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const jobs = jobsQ.data?.data ?? [];
  const schedules = schedulesQ.data ?? [];

  return (
    <Page width="regular">
      <PageHeader
        title={<span data-testid="integration-detail-title">{i.display_name}</span>}
        action={
          <>
            <Button
              variant="ghost"
              onClick={onTest}
              disabled={test.isPending}
              data-testid="integration-detail-test"
            >
              {test.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Проверить
            </Button>
            <Button
              onClick={onSync}
              disabled={sync.isPending || isPendingAuth}
              data-testid="integration-detail-sync"
            >
              {sync.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Синхронизировать
            </Button>
          </>
        }
      />

      {/* pending_auth — single-line nudge to re-OAuth */}
      {isPendingAuth && (
        <div className="flex items-start gap-3 border-t border-border/50 pt-6 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-500" />
          <div className="space-y-2">
            <p>
              Подключение требует авторизации. Без неё импорт работать не будет.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={onReauth}
              disabled={oauth.isPending}
              data-testid="integration-detail-reauth"
            >
              {oauth.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Пройти авторизацию заново
            </Button>
          </div>
        </div>
      )}

      {/* Name */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Название
        </h2>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="integration-display-name" className="sr-only">
              Название
            </Label>
            <Input
              id="integration-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
              data-testid="integration-detail-name"
            />
          </div>
          <Button
            onClick={onSaveName}
            disabled={!dirtyName || update.isPending}
            data-testid="integration-detail-save"
          >
            {update.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Сохранить
          </Button>
        </div>
      </section>

      {/* Schedules */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Расписание автосинхронизации
        </h2>

        {schedulesQ.isLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загружаем…
          </div>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Расписаний нет — добавьте ниже, чтобы импорт шёл автоматически.
          </p>
        ) : (
          <ul
            className="divide-y divide-border/40"
            data-testid="integration-detail-schedules"
          >
            {schedules.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
                data-testid={`schedule-${s.id}`}
              >
                <div className="flex items-center gap-3">
                  <code className="rounded bg-muted/50 px-2 py-0.5 font-mono text-xs">
                    {s.cron}
                  </code>
                  <span
                    className={
                      s.enabled
                        ? 'text-xs text-emerald-600 dark:text-emerald-400'
                        : 'text-xs text-muted-foreground/70'
                    }
                  >
                    {s.enabled ? 'включено' : 'выключено'}
                  </span>
                  {s.next_run_at && (
                    <span className="text-xs text-muted-foreground">
                      следующий запуск {dayjs(s.next_run_at).format('D MMM, HH:mm')}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={() => onDeleteSchedule(s.id)}
                  aria-label="Удалить расписание"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label htmlFor="schedule-cron">Cron-выражение</Label>
            <Input
              id="schedule-cron"
              value={cron}
              onChange={(e) => setCron(e.currentTarget.value)}
              placeholder="0 */6 * * *"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Например: <span className="font-mono">0 */6 * * *</span> — раз в 6 часов.
            </p>
          </div>
          <div className="flex items-center gap-2 pb-2.5">
            <Switch
              id="schedule-enabled"
              checked={scheduleEnabled}
              onCheckedChange={setScheduleEnabled}
            />
            <Label htmlFor="schedule-enabled" className="text-sm">
              Включено
            </Label>
          </div>
          <Button
            onClick={onAddSchedule}
            disabled={createSchedule.isPending || !cron.trim()}
          >
            {createSchedule.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Добавить
          </Button>
        </div>
      </section>

      {/* Sync history */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          История синхронизаций
        </h2>

        {jobsQ.isLoading ? (
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
                  {j.stats && (
                    <p className="pl-5 text-xs text-muted-foreground">
                      импортировано {j.stats.imported} · пропущено{' '}
                      {j.stats.skipped} · ошибок {j.stats.failed}
                    </p>
                  )}
                  {j.error && (
                    <p className="pl-5 text-xs text-destructive">
                      {j.error.title}
                      {j.error.detail ? `: ${j.error.detail}` : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Disconnect */}
      <section className="border-t border-border/50 pt-6">
        <Button
          variant="ghost"
          onClick={onDisconnect}
          disabled={remove.isPending}
          className="text-destructive hover:text-destructive"
          data-testid="integration-detail-disconnect"
        >
          {remove.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          <Trash2 className="mr-2 h-4 w-4" />
          Отключить интеграцию
        </Button>
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

export default IntegrationDetailPage;
