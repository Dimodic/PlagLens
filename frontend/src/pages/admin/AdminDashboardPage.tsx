/**
 * /admin — top-level admin overview.
 *
 * KPI strip + integration health + recent-audit timeline. Flat layout
 * (no card chrome) per the minimalism principle.
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/layout/Page';
import { StatsPanel } from '@/components/common/StatsPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation, t } from '@/i18n';
import { useUsers } from '@/hooks/api/useUsers';
import {
  useIntegrations,
  useIntegrationsHealth,
} from '@/hooks/api/useIntegrations';
import { useAuditEvents } from '@/hooks/api/useAudit';
import type { IntegrationStatus } from '@/api/endpoints/integrations';

function statusDot(s: IntegrationStatus | string): string {
  if (s === 'active') return 'bg-sev-low';
  if (s === 'pending_auth') return 'bg-sev-mid';
  return 'bg-sev-high';
}

function statusLabel(s: IntegrationStatus | string): string {
  if (s === 'active') return 'OK';
  if (s === 'pending_auth') return t('admin_dashboard.status_pending');
  if (s === 'disabled') return t('admin_dashboard.status_disabled');
  return t('admin_dashboard.status_error');
}

interface KPI {
  label: string;
  v: string | number;
  sub?: string;
}

export function AdminDashboardPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('admin_dashboard.title'));

  const usersQ = useUsers({ limit: 1 });
  const integrationsQ = useIntegrations({ limit: 8 });
  const healthQ = useIntegrationsHealth();
  const auditQ = useAuditEvents({ limit: 5 });

  const usersTotal = usersQ.data?.pagination.has_more
    ? `${usersQ.data?.data.length}+`
    : usersQ.data?.data.length ?? 0;
  const healthRows = Array.isArray(healthQ.data)
    ? healthQ.data
    : (healthQ.data?.data ?? []);
  const integrationsActive = healthRows.filter((i) => i.status === 'active').length;
  const integrationsTotal = healthRows.length;
  const openIncidents = healthRows.filter(
    (i) => i.status === 'error' || i.last_sync_status === 'failed',
  ).length;

  const kpis: KPI[] = [
    { label: t('admin_dashboard.kpi_active_users'), v: usersTotal },
    {
      label: t('admin_dashboard.kpi_integrations'),
      v: integrationsTotal === 0 ? '—' : integrationsActive,
      sub: integrationsTotal === 0 ? undefined : `/${integrationsTotal}`,
    },
    { label: t('admin_dashboard.kpi_checks_today'), v: '—' },
    { label: t('admin_dashboard.kpi_incidents'), v: openIncidents },
  ];

  const integrations = (integrationsQ.data?.data ?? []).slice(0, 6);
  const auditEvents = auditQ.data?.data ?? [];

  return (
    <Page width="regular">
      <PageHeader title={t('admin_dashboard.title')} />

      <StatsPanel
        data-testid="admin-home-kpis"
        items={kpis.map((k) => ({
          label: k.label,
          value: (
            <span className="tabular-nums">
              {k.v}
              {k.sub && (
                <span className="ml-1 text-sm text-muted-foreground">{k.sub}</span>
              )}
            </span>
          ),
        }))}
      />

      {/* Integration health */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">{t('admin_dashboard.integrations_heading')}</h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            data-testid="admin-home-integrations-link"
          >
            <Link to="/admin/integrations">
              {t('admin_dashboard.see_all')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {integrations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('admin_dashboard.integrations_empty')}
          </p>
        ) : (
          <div className="divide-y divide-border/50" data-testid="admin-home-integrations">
            {integrations.map((it) => (
              <div key={it.id} className="flex items-center gap-4 px-3 py-4">
                <span className={`h-2 w-2 flex-none rounded-full ${statusDot(it.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {it.display_name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {it.kind} · {statusLabel(it.status)}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {it.last_sync_at ? dayjs(it.last_sync_at).fromNow() : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Audit log */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">{t('admin_dashboard.audit_heading')}</h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            data-testid="admin-home-audit-link"
          >
            <Link to="/admin/audit">
              {t('admin_dashboard.audit_go')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {auditEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('admin_dashboard.audit_empty')}
          </p>
        ) : (
          <div className="divide-y divide-border/50" data-testid="admin-home-audit">
            {auditEvents.map((e) => {
              const tone =
                e.result === 'failure'
                  ? 'text-sev-high'
                  : e.action.startsWith('llm.') || e.action.startsWith('ai.')
                    ? 'text-primary'
                    : 'text-muted-foreground';
              return (
                <div
                  key={e.id}
                  className="grid items-center gap-4 px-3 py-3 text-sm"
                  style={{ gridTemplateColumns: '110px 1fr 200px 80px' }}
                >
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {dayjs(e.occurred_at).fromNow()}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{e.action}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {e.resource.type} {e.resource.id ?? ''}
                    </div>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {e.actor.display_name ?? e.actor.id ?? e.actor.type}
                  </span>
                  <span className={`text-right text-xs font-medium ${tone}`}>
                    {e.result}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </Page>
  );
}

export default AdminDashboardPage;
