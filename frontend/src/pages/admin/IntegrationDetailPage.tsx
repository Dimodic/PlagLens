/**
 * /admin/integrations/:id — view / edit / schedules / sync / OAuth.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { IntegrationStatusBadge } from '@/components/admin/IntegrationStatusBadge';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  IntegrationConfigForm,
  type IntegrationConfigFormValues,
} from '@/components/admin/IntegrationConfigForm';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useCreateSchedule,
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

  const integrationQ = useIntegration(id);
  const schedulesQ = useSchedules(id);
  const jobsQ = useImportJobs(id, { limit: 20 });
  const update = useUpdateIntegration(id ?? '');
  const test = useTestIntegration();
  const sync = useSyncNow(id ?? '');
  const oauth = useOauthStartIntegration();
  const createSchedule = useCreateSchedule(id ?? '');
  const deleteSchedule = useDeleteSchedule(id ?? '');

  const [values, setValues] = useState<IntegrationConfigFormValues>({
    display_name: '',
    course_id: null,
    settings: {},
  });
  const [cron, setCron] = useState('0 */6 * * *');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  useEffect(() => {
    if (integrationQ.data) {
      setValues({
        display_name: integrationQ.data.display_name,
        course_id: integrationQ.data.course_id,
        settings: integrationQ.data.settings ?? {},
      });
    }
  }, [integrationQ.data]);

  if (integrationQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (integrationQ.error) {
    return <ProblemAlert problem={integrationQ.error as unknown as Problem} />;
  }

  const i = integrationQ.data;
  if (!i) return null;

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        display_name: values.display_name,
        settings: values.settings,
      });
      notify.success('Сохранено');
      integrationQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleTest = async () => {
    try {
      const r = await test.mutateAsync(i.id);
      if (r.ok) {
        notify.success(`Connection OK${r.latency_ms ? ` (${r.latency_ms}ms)` : ''}`);
      } else {
        // Backend uses `detail`; some legacy callers used `message` — try both.
        const why = r.detail ?? r.message;
        notify.error(why ? `Тест не прошёл: ${why}` : 'Тест не прошёл');
      }
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleSync = async () => {
    try {
      await sync.mutateAsync({});
      notify.success('Sync запущен');
      jobsQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleOAuth = async () => {
    try {
      const r = await oauth.mutateAsync(i.id);
      window.location.href = r.authorize_url;
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleAddSchedule = async () => {
    try {
      await createSchedule.mutateAsync({ cron, enabled: scheduleEnabled });
      notify.success('Расписание добавлено');
      setCron('0 */6 * * *');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleDeleteSchedule = async (sid: string) => {
    try {
      await deleteSchedule.mutateAsync(sid);
      notify.success('Удалено');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Page width="regular">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {i.display_name}
            <span className="flex items-center gap-2">
              <StatusPill tone="neutral">{i.kind}</StatusPill>
              <IntegrationStatusBadge status={i.status} />
            </span>
          </span>
        }
        action={
          <>
            <Button variant="ghost" onClick={handleTest} disabled={test.isPending}>
              {test.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Тест
            </Button>
            <Button onClick={handleSync} disabled={sync.isPending}>
              {sync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sync now
            </Button>
            {i.status === 'pending_auth' && (
              <Button variant="outline" onClick={handleOAuth} className="text-amber-600 border-amber-600">
                Re-auth
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="jobs">Sync history</TabsTrigger>
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="pt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <IntegrationConfigForm
                kind={i.kind}
                value={values}
                onChange={setValues}
                readonlyCourse
              />
              <div className="flex items-center justify-end">
                <Button onClick={handleSave} disabled={update.isPending}>
                  {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Сохранить
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="pt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="schedule-cron">Cron</Label>
                  <Input
                    id="schedule-cron"
                    value={cron}
                    onChange={(e) => setCron(e.currentTarget.value)}
                  />
                  <p className="text-xs text-muted-foreground">Например: 0 */6 * * *</p>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id="schedule-enabled"
                    checked={scheduleEnabled}
                    onCheckedChange={(v) => setScheduleEnabled(v)}
                  />
                  <Label htmlFor="schedule-enabled">Enabled</Label>
                </div>
                <Button onClick={handleAddSchedule} disabled={createSchedule.isPending}>
                  {createSchedule.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Добавить
                </Button>
              </div>

              {schedulesQ.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : schedulesQ.data && schedulesQ.data.length > 0 ? (
                <div className="space-y-2">
                  {schedulesQ.data.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3"
                      data-testid={`schedule-${s.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                          {s.cron}
                        </code>
                        <StatusPill tone={s.enabled ? 'success' : 'neutral'}>
                          {s.enabled ? 'enabled' : 'disabled'}
                        </StatusPill>
                        {s.next_run_at && (
                          <span className="text-xs text-muted-foreground">
                            next: {dayjs(s.next_run_at).format('DD.MM HH:mm')}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSchedule(s.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Расписаний нет</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="pt-4">
          {jobsQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : jobsQ.data && jobsQ.data.data.length > 0 ? (
            <div className="space-y-3">
              {jobsQ.data.data.map((j) => (
                <Card key={j.id} data-testid={`job-${j.id}`}>
                  <CardContent className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <StatusPill tone="neutral">{j.status}</StatusPill>
                        <span className="text-xs font-mono">{j.id}</span>
                        <span className="text-xs text-muted-foreground">{j.trigger}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {j.started_at
                          ? dayjs(j.started_at).format('DD.MM HH:mm')
                          : 'queued'}
                      </span>
                    </div>
                    {j.stats && (
                      <p className="text-xs text-muted-foreground">
                        imported: {j.stats.imported} • skipped: {j.stats.skipped} •
                        failed: {j.stats.failed}
                      </p>
                    )}
                    {j.error && (
                      <p className="text-xs text-destructive">
                        {j.error.title}
                        {j.error.detail ? `: ${j.error.detail}` : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="Импортов ещё не было" />
          )}
        </TabsContent>

        <TabsContent value="cursor" className="pt-4">
          <Card>
            <CardContent className="p-6">
              <p className="mb-3 text-sm text-muted-foreground">
                Текущий cursor (kind-specific):
              </p>
              <pre className="overflow-auto rounded bg-muted p-3 text-xs font-mono">
                {JSON.stringify(i.cursor ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default IntegrationDetailPage;
