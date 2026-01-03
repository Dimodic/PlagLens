/**
 * ImportJobHistory — chronological list of every import job across every
 * integration in the tenant.
 *
 * Lifted out of the old standalone `/imports` page when submission-import
 * was consolidated into the «Интеграции» section: the integration cards
 * already own "run an import" (their hover «Запустить импорт» action);
 * this is the cross-integration history.
 *
 * Visual contract: flat document-style rows (status dot, source name,
 * meta line of trigger / counts / duration / time), no `<Table>` chrome
 * and no uppercase header grid. Matches the redesigned Export page and
 * Suspicious panel.
 */
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  AlertCircle,
  CalendarClock,
  ExternalLink,
  HandIcon,
  Loader2,
  Webhook,
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { integrationsApi } from '@/api/endpoints/integrations';
import type {
  ImportJob,
  IntegrationConfig,
  IntegrationKind,
} from '@/api/endpoints/integrations';

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
  source_kind: IntegrationKind;
}

// Status surfacing rule: "completed" is the default — saying so on
// every row is noise. We highlight only non-trivial states (running /
// failed / queued) and keep the colour palette to the existing sev-*
// + muted tokens.
interface StatusUi {
  label: string;
  tone: string;
}

const STATUS_UI: Record<ImportJob['status'], StatusUi | null> = {
  queued: { label: 'в очереди', tone: 'text-muted-foreground' },
  running: { label: 'в работе', tone: 'text-primary' },
  completed: null,
  failed: { label: 'ошибка', tone: 'text-sev-high' },
};

function triggerLabel(t: ImportJob['trigger']): {
  icon: React.ReactNode;
  text: string;
} {
  if (t === 'manual')
    return {
      icon: <HandIcon className="h-3 w-3" />,
      text: 'вручную',
    };
  if (t === 'scheduled')
    return {
      icon: <CalendarClock className="h-3 w-3" />,
      text: 'по расписанию',
    };
  return {
    icon: <Webhook className="h-3 w-3" />,
    text: 'webhook',
  };
}

function duration(started?: string | null, finished?: string | null): string {
  if (!started) return '—';
  const start = dayjs(started);
  const end = finished ? dayjs(finished) : dayjs();
  const ms = end.diff(start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000)
    return `${Math.floor(ms / 60_000)}м ${Math.floor((ms / 1000) % 60)}с`;
  return `${Math.floor(ms / 3_600_000)}ч`;
}

export function ImportJobHistory({
  integrations,
}: {
  integrations: IntegrationConfig[];
}) {
  // Fan-out: one parallel query per integration for its 10 most recent
  // jobs. Tenant size is 2–5 integrations, so the burst is small.
  // Refetch every 10s while anything could still be running.
  const jobQueries = useQueries({
    queries: integrations.map((it) => ({
      queryKey: ['integration', it.id, 'jobs', { limit: 10 }],
      queryFn: () => integrationsApi.listImportJobs(it.id, { limit: 10 }),
      enabled: !!it.id,
      refetchInterval: 10_000,
    })),
  });

  const jobs: JobWithSource[] = integrations.flatMap((it, idx) => {
    const data = jobQueries[idx]?.data?.data ?? [];
    const sourceTitle = KIND_TITLES[it.kind] ?? it.kind;
    return data.map((j) => ({
      ...j,
      source_title: sourceTitle,
      source_display_name: it.display_name,
      source_kind: it.kind,
    }));
  });
  jobs.sort((a, b) => {
    const ta = (a.started_at || a.finished_at || '').localeCompare(
      b.started_at || b.finished_at || '',
    );
    return -ta;
  });

  const anyLoading = jobQueries.some((q) => q.isPending);

  return (
    <section
      className="space-y-3 border-t border-border/60 pt-6"
      data-testid="imports-history"
    >
      <h2 className="text-base font-semibold text-foreground">
        История импортов
      </h2>
      {anyLoading && jobs.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Подтягиваем историю…
        </div>
      ) : jobs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Импортов ещё не было.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </section>
  );
}

function JobRow({ job }: { job: JobWithSource }) {
  const stats = job.stats ?? { imported: 0, skipped: 0, failed: 0 };
  const trig = triggerLabel(job.trigger);
  const when = job.started_at
    ? dayjs(job.started_at).format('D MMM HH:mm')
    : '—';
  // Drop the redundant display_name when it's identical to the kind
  // title — saves us from rendering "Yandex.Contest · Yandex.Contest".
  const subtitle =
    job.source_display_name && job.source_display_name !== job.source_title
      ? job.source_display_name
      : null;
  const status = STATUS_UI[job.status];
  return (
    <li data-testid={`imports-job-${job.id}`} className="group">
      <Link
        to={`/integrations/${job.integration_id}`}
        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-medium text-foreground truncate">
              {job.source_title}
            </span>
            {subtitle && (
              <span className="text-xs text-muted-foreground truncate">
                {subtitle}
              </span>
            )}
            {status && (
              <span className={cn('text-xs flex-none', status.tone)}>
                {status.label}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              {trig.icon}
              {trig.text}
            </span>
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <span className="tabular-nums">{when}</span>
            {job.error && (
              <span className="inline-flex items-center gap-1 text-sev-high">
                <AlertCircle className="h-3 w-3" />
                {job.error.title}
              </span>
            )}
          </div>
        </div>
        <div className="hidden sm:flex flex-none items-center gap-3 text-xs tabular-nums text-muted-foreground">
          <span className="w-16 text-right">
            <span className="font-medium text-foreground">
              {stats.imported}
            </span>
            {stats.failed > 0 && (
              <span className="ml-1 text-sev-high">({stats.failed} ✗)</span>
            )}
          </span>
          <span className="w-14 text-right">
            {duration(job.started_at, job.finished_at)}
          </span>
        </div>
        <ExternalLink
          className="h-3.5 w-3.5 flex-none text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  );
}

export default ImportJobHistory;
