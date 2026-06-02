/**
 * Admin "Метрики" — high-level health metrics dashboard with links to
 * Prometheus / Grafana / Jaeger.
 */
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/Page';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useTenantDashboard } from '@/hooks/api/useDashboards';
import { useServicesStatus } from '@/hooks/api/useSystem';
import type { ServiceStatus } from '@/api/endpoints/system';

const SERVICES = [
  { name: 'identity', port: 8002 },
  { name: 'course', port: 8003 },
  { name: 'submission', port: 8004 },
  { name: 'integration', port: 8005 },
  { name: 'plagiarism', port: 8006 },
  { name: 'ai-analysis', port: 8007 },
  { name: 'notification', port: 8008 },
  { name: 'reporting', port: 8009 },
  { name: 'audit', port: 8010 },
  { name: 'gateway', port: 8001 },
];

// Map gateway-aggregated status to a colored indicator class.
const STATUS_DOT: Record<ServiceStatus['status'], string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-red-500',
  unknown: 'bg-slate-400',
};

export default function AdminMetricsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('admin_metrics.title'));
  // Backend does not resolve a literal "current" tenant — pass the actor's
  // tenant_id from the auth context instead.
  const { user } = useAuth();
  const dash = useTenantDashboard(user?.tenant?.id) as any;
  const tokens = dash.data?.ai_tokens_used_30d ?? null;
  const cost = dash.data?.ai_cost_total_30d ?? null;
  const health = useServicesStatus();
  const healthByName = new Map<string, ServiceStatus>();
  for (const s of health.data?.services ?? []) {
    healthByName.set(s.name, s);
  }

  return (
    <Page width="wide">
      <PageHeader title={t('admin_metrics.title')} />

      {/* Services */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">{t('admin_metrics.services_heading')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {SERVICES.map((s) => (
            <ServiceTile
              key={s.name}
              name={s.name}
              port={s.port}
              health={healthByName.get(s.name)}
              isLoading={health.isLoading}
            />
          ))}
        </div>
      </section>

      {/* LLM */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">{t('admin_metrics.llm_heading')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric
            label={t('admin_metrics.tokens')}
            value={
              tokens != null
                ? Number(tokens).toLocaleString('ru-RU')
                : dash.isLoading
                  ? '…'
                  : '—'
            }
          />
          <Metric
            label={t('admin_metrics.cost')}
            value={
              cost != null
                ? `$${Number(cost).toFixed(2)}`
                : dash.isLoading
                  ? '…'
                  : '—'
            }
          />
          <Metric
            label={t('admin_metrics.active_users')}
            value={String((dash.data as any)?.active_users ?? '—')}
          />
          <Metric
            label={t('admin_metrics.active_courses')}
            value={String(dash.data?.active_courses ?? '—')}
          />
        </div>
      </section>

      {/* External dashboards */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">{t('admin_metrics.external_heading')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ExternalDashboardLink name="Grafana" href="http://localhost:3000" />
          <ExternalDashboardLink name="Prometheus" href="http://localhost:9090" />
          <ExternalDashboardLink name="Jaeger" href="http://localhost:16686" />
          <ExternalDashboardLink name="Kafka UI" href="http://localhost:8080" />
        </div>
      </section>
    </Page>
  );
}

function ServiceTile({
  name,
  port,
  health,
  isLoading,
}: {
  name: string;
  port: number;
  health: ServiceStatus | undefined;
  isLoading: boolean;
}) {
  // Status sourced from gateway-aggregated /v1/services-status (see useServicesStatus).
  // Initial render while the query is loading shows neutral grey.
  const status: ServiceStatus['status'] = health?.status ?? 'unknown';
  const dotClass =
    isLoading && !health ? 'bg-muted-foreground/40' : STATUS_DOT[status];
  const latency = health?.latency_ms;
  const statusLabel = isLoading && !health ? 'checking…' : status;
  return (
    <Card
      data-testid={`service-tile-${name}`}
      className="border-border/70"
    >
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={`h-2 w-2 flex-none rounded-full ${dotClass}`}
          title={`${name}: ${statusLabel}${latency != null ? ` · ${latency}ms` : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm font-medium text-foreground">
            <span>{name}</span>
            {latency != null && (
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {latency}ms
              </span>
            )}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            :{port} · {statusLabel}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function ExternalDashboardLink({
  name,
  href,
}: {
  name: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group block"
    >
      <Card className="border-border/70 transition-colors hover:bg-muted/40">
        <CardContent className="flex items-center gap-2 p-4">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <ExternalLinkIcon className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
        </CardContent>
      </Card>
    </a>
  );
}
