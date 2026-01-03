/**
 * /imports — operational dashboard for IMPORT jobs (not integration config).
 *
 * Differs from /integrations by audience and purpose:
 *   /integrations — "what's plugged in"  (OAuth tokens, schedules, test/delete)
 *   /imports      — "what was actually imported and when"
 *
 * Layout:
 *   1. Quick-run strip: one button per connected integration → triggers
 *      `syncNow` and tail-toasts the result. No setup, no config.
 *   2. History table: chronological list of every import_job across every
 *      integration in the tenant, with trigger / status / counts / errors.
 *   3. Empty state when nothing is connected → CTA to /integrations.
 */
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ArrowDownToLine,
  Loader2,
  PlayCircle,
  PlugZap,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  CalendarClock,
  Webhook,
  HandIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useIntegrations,
  useSyncNow,
} from '@/hooks/api/useIntegrations';
import { integrationsApi } from '@/api/endpoints/integrations';
import type {
  ImportJob,
  IntegrationConfig,
  IntegrationKind,
} from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

const KIND_TITLES: Record<IntegrationKind, string> = {
  yandex_contest: 'Yandex.Contest',
  stepik: 'Stepik',
  ejudge: 'eJudge',
  manual: 'Ручная загрузка',
  telegram: 'Telegram',
  google_sheets: 'Google Sheets',
};

interface JobWithSource extends ImportJob {
  source_title: string;
  source_display_name: string;
}

function jobStatusBadge(status: ImportJob['status']) {
  if (status === 'completed')
    return (
      <Badge className="bg-sev-low-bg text-sev-low border-sev-low/40 font-normal">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Готово
      </Badge>
    );
  if (status === 'failed')
    return (
      <Badge className="bg-sev-high-bg text-sev-high border-sev-high/40 font-normal">
        <XCircle className="mr-1 h-3 w-3" /> Ошибка
      </Badge>
    );
  if (status === 'running')
    return (
      <Badge className="bg-sev-mid-bg text-sev-mid border-sev-mid/40 font-normal">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> В работе
      </Badge>
    );
  return (
    <Badge variant="outline" className="font-normal">
      <Clock className="mr-1 h-3 w-3" /> В очереди
    </Badge>
  );
}

function triggerLabel(t: ImportJob['trigger']) {
  if (t === 'manual')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <HandIcon className="h-3 w-3" /> Вручную
      </span>
    );
  if (t === 'scheduled')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarClock className="h-3 w-3" /> По расписанию
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Webhook className="h-3 w-3" /> Webhook
    </span>
  );
}

function duration(started?: string | null, finished?: string | null) {
  if (!started) return '—';
  const start = dayjs(started);
  const end = finished ? dayjs(finished) : dayjs();
  const ms = end.diff(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}м ${Math.floor((ms / 1000) % 60)}с`;
  return `${Math.floor(ms / 3_600_000)}ч`;
}

export default function ImportsPage() {
  useDocumentTitle('Импорт посылок');
  const integrationsQ = useIntegrations({ limit: 100 });
  const integrations = integrationsQ.data?.data ?? [];

  // Fan-out: one parallel query per integration for its 10 most recent jobs.
  // Tenant size is 2-5 integrations, so the burst is small. Refetch each
  // every 10s while any job is running.
  const jobQueries = useQueries({
    queries: integrations.map((it) => ({
      queryKey: ['integration', it.id, 'jobs', { limit: 10 }],
      queryFn: () => integrationsApi.listImportJobs(it.id, { limit: 10 }),
      enabled: !!it.id,
      refetchInterval: 10_000,
    })),
  });

  const allJobs: JobWithSource[] = integrations.flatMap((it, idx) => {
    const data = jobQueries[idx]?.data?.data ?? [];
    const sourceTitle = KIND_TITLES[it.kind] ?? it.kind;
    return data.map((j) => ({
      ...j,
      source_title: sourceTitle,
      source_display_name: it.display_name,
    }));
  });
  // Newest first
  allJobs.sort((a, b) => {
    const ta = (a.started_at || a.finished_at || '').localeCompare(b.started_at || b.finished_at || '');
    return -ta;
  });

  return (
    <Page width="wide" data-testid="imports-page">
      <PageHeader title="Импорт посылок" />

      {integrationsQ.error && (
        <ProblemAlert problem={integrationsQ.error as unknown as Problem} />
      )}

      {integrationsQ.isPending ? (
        <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
        </div>
      ) : integrations.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <QuickRunStrip integrations={integrations} />
          <JobHistory
            jobs={allJobs}
            anyLoading={jobQueries.some((q) => q.isPending)}
          />
        </>
      )}
    </Page>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="imports-empty"
      className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-16 text-center"
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
        <ArrowDownToLine className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Нет подключённых интеграций</h2>
      <Button asChild data-testid="imports-empty-cta">
        <Link to="/integrations">
          <PlugZap className="mr-2" />
          Перейти к интеграциям
        </Link>
      </Button>
    </div>
  );
}

function QuickRunStrip({ integrations }: { integrations: IntegrationConfig[] }) {
  return (
    <section className="space-y-3" data-testid="imports-quick-run">
      <h2 className="text-xl font-bold tracking-tight">Запустить импорт</h2>
      <Card className="border-border/70">
        <CardContent className="p-0">
          {integrations.map((it, idx) => (
            <QuickRunRow key={it.id} integration={it} first={idx === 0} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function QuickRunRow({
  integration,
  first,
}: {
  integration: IntegrationConfig;
  first: boolean;
}) {
  const notify = useNotifications();
  const sync = useSyncNow(integration.id);
  const title = KIND_TITLES[integration.kind] ?? integration.kind;
  const isActive = integration.status === 'active';

  const onRun = async () => {
    try {
      await sync.mutateAsync({});
      notify.success('Импорт запущен в фоне');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 ${
        first ? '' : 'border-t border-border/70'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {!isActive && (
            <Badge variant="outline" className="text-xs font-normal">
              {integration.status}
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {integration.display_name}
          {integration.course_id && ` · курс #${integration.course_id}`}
        </div>
      </div>
      <Button
        onClick={onRun}
        disabled={sync.isPending || !isActive}
        title={!isActive ? 'Сначала активируйте на /integrations' : undefined}
        data-testid={`imports-run-${integration.id}`}
        size="sm"
      >
        {sync.isPending ? (
          <Loader2 className="mr-2 animate-spin" />
        ) : (
          <PlayCircle className="mr-2" />
        )}
        Запустить
      </Button>
    </div>
  );
}

function JobHistory({
  jobs,
  anyLoading,
}: {
  jobs: JobWithSource[];
  anyLoading: boolean;
}) {
  return (
    <section className="space-y-3" data-testid="imports-history">
      <h2 className="text-xl font-bold tracking-tight">История импортов</h2>
      <Card className="border-border/70">
        <CardContent className="p-0">
          {anyLoading && jobs.length === 0 ? (
            <div className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Подтягиваем
              историю…
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Импортов ещё не было.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_0.7fr_auto] gap-4 border-b border-border/70 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <div>Источник</div>
                <div>Когда</div>
                <div>Триггер</div>
                <div>Статус</div>
                <div className="text-right">Импортировано</div>
                <div className="text-right pl-2">Длит.</div>
              </div>
              {jobs.map((j, i) => (
                <JobRow key={j.id} job={j} first={i === 0} />
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function JobRow({ job, first }: { job: JobWithSource; first: boolean }) {
  const stats = job.stats ?? { imported: 0, skipped: 0, failed: 0 };
  return (
    <Link
      to={`/integrations/${job.integration_id}`}
      data-testid={`imports-job-${job.id}`}
      className={`grid grid-cols-[1.4fr_1fr_1fr_1fr_0.7fr_auto] items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-muted/30 ${
        first ? '' : 'border-t border-border/70'
      }`}
    >
      <div className="min-w-0">
        <div className="font-medium text-foreground">{job.source_title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {job.source_display_name}
        </div>
      </div>
      <div className="text-muted-foreground tabular-nums">
        {job.started_at
          ? dayjs(job.started_at).format('DD.MM.YYYY HH:mm')
          : '—'}
      </div>
      <div>{triggerLabel(job.trigger)}</div>
      <div>
        <div>{jobStatusBadge(job.status)}</div>
        {job.error && (
          <div className="mt-1 flex items-start gap-1 text-xs text-sev-high">
            <AlertCircle className="mt-0.5 h-3 w-3 flex-none" />
            <span className="truncate">{job.error.title}</span>
          </div>
        )}
      </div>
      <div className="text-right tabular-nums">
        <span className="font-medium text-foreground">{stats.imported}</span>
        {stats.failed > 0 && (
          <span className="ml-1 text-xs text-sev-high">
            ({stats.failed} ✗)
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pl-2 text-xs tabular-nums text-muted-foreground">
        {duration(job.started_at, job.finished_at)}
        <ExternalLink className="h-3 w-3 opacity-50" />
      </div>
    </Link>
  );
}
