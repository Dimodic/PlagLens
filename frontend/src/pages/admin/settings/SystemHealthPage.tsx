/**
 * /admin/system/health — gateway aggregated /v1/services-status.
 */
import dayjs from 'dayjs';
import { Activity, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
  useDocumentTitle('System health');
  const { data, isLoading, error } = useServicesStatus();

  const services = data?.services ?? [];

  return (
    <Page width="regular">
      <PageHeader title="System health" />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-12" />}
          title="Нет данных о сервисах"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {services.map((s) => (
            <Card key={s.name} data-testid={`service-card-${s.name}`}>
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{s.name}</p>
                  <StatusPill tone={STATUS_TONES[s.status]}>{s.status}</StatusPill>
                </div>
                {s.version && (
                  <p className="text-xs font-mono text-muted-foreground">
                    v{s.version}
                  </p>
                )}
                {s.latency_ms != null && (
                  <p className="text-xs text-muted-foreground">
                    latency: {s.latency_ms}ms
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  last check:{' '}
                  {dayjs(s.last_checked_at).format('DD.MM HH:mm:ss')}
                </p>
                {s.message && (
                  <p className="text-xs text-amber-600">{s.message}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data?.recent_errors && data.recent_errors.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Recent errors</h2>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-2">
                {data.recent_errors.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{e.message}</span>
                    <div className="flex items-center gap-2">
                      <StatusPill tone="neutral">{e.service}</StatusPill>
                      <span className="text-xs text-muted-foreground">
                        {dayjs(e.occurred_at).format('DD.MM HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </Page>
  );
}

export default SystemHealthPage;
