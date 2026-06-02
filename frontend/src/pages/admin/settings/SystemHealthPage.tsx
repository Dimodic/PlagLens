/**
 * /admin/system/health — gateway-aggregated /api/v1/services-status.
 *
 * Flat per the UI rules (.claude/UI_RULES.md): NO card chrome, hairline
 * group separators only, Russian copy. Rows breathe with air + hover, not
 * per-row dividers.
 */
import dayjs from 'dayjs';
import { Activity, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useServicesStatus } from '@/hooks/api/useSystem';
import type { ServiceStatus } from '@/api/endpoints/system';
import type { Problem } from '@/api/types';

const STATUS_TONES: Record<ServiceStatus['status'], StatusTone> = {
  healthy: 'success',
  degraded: 'warning',
  unhealthy: 'destructive',
  unknown: 'neutral',
};

export function SystemHealthPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('system_health.title'));
  const { data, isLoading, error } = useServicesStatus();

  const services = data?.services ?? [];
  const recentErrors = data?.recent_errors ?? [];

  return (
    <Page width="regular">
      <PageHeader title={t('system_health.title')} />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-12" />}
          title={t('system_health.empty')}
        />
      ) : (
        <div className="space-y-0.5">
          {services.map((s) => (
            <div
              key={s.name}
              data-testid={`service-card-${s.name}`}
              className="rounded-md px-2 py-3 transition-colors hover:bg-muted/30"
            >
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <StatusPill tone={STATUS_TONES[s.status]}>{s.status}</StatusPill>
                  <span className="truncate font-mono text-foreground">
                    {s.name}
                  </span>
                  {s.version && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      v{s.version}
                    </span>
                  )}
                  {s.message && (
                    <span className="truncate text-xs text-amber-600 dark:text-amber-400">
                      {s.message}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {s.latency_ms != null
                      ? t('system_settings.latency_ms', {
                          ms: Math.round(s.latency_ms),
                        })
                      : '—'}
                  </span>
                  <span>{dayjs(s.last_checked_at).format('DD.MM HH:mm:ss')}</span>
                </div>
              </div>
              {s.checks && Object.keys(s.checks).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-1 text-xs">
                  {Object.entries(s.checks).map(([dep, val]) => {
                    const ok = val === 'ok';
                    return (
                      <span
                        key={dep}
                        className="inline-flex items-center gap-1.5 font-mono"
                        title={ok ? undefined : val}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            ok ? 'bg-emerald-500' : 'bg-red-500',
                          )}
                        />
                        <span className="text-muted-foreground">{dep}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {recentErrors.length > 0 && (
        <section className="space-y-3 border-t border-border/50 pt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t('system_health.recent_errors')}
          </h2>
          <div className="space-y-0.5">
            {recentErrors.map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-2 py-2.5"
              >
                <span className="truncate text-sm">{e.message}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill tone="neutral">{e.service}</StatusPill>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {dayjs(e.occurred_at).format('DD.MM HH:mm')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

export default SystemHealthPage;
