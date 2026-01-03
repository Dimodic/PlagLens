/**
 * /admin — top-level admin dashboard.
 *
 * Tenant headline + KPI grid + integration health rows + recent-audit timeline.
 * Live data from existing hooks (tenants, users, integrations health, audit).
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/Page';
import { StatsPanel } from '@/components/common/StatsPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTenants } from '@/hooks/api/useTenants';
import { useUsers } from '@/hooks/api/useUsers';
import {
  useIntegrations,
  useIntegrationsHealth,
} from '@/hooks/api/useIntegrations';
import { useAuditEvents } from '@/hooks/api/useAudit';
import { useAuth } from '@/auth/useAuth';
import type { IntegrationStatus } from '@/api/endpoints/integrations';

function statusDot(s: IntegrationStatus | string): string {
  if (s === 'active') return 'bg-sev-low';
  if (s === 'pending_auth') return 'bg-sev-mid';
  return 'bg-sev-high';
}

function statusLabel(s: IntegrationStatus | string): string {
  if (s === 'active') return 'OK';
  if (s === 'pending_auth') return 'pending';
  if (s === 'disabled') return 'off';
  return 'error';
}

interface KPI {
  label: string;
  v: string | number;
  sub?: string;
}

export function AdminDashboardPage() {
  useDocumentTitle('Админ-панель');
  const { user } = useAuth();

  const tenantsQ = useTenants({ limit: 5 });
  const usersQ = useUsers({ limit: 1 });
  const integrationsQ = useIntegrations({ limit: 8 });
  const healthQ = useIntegrationsHealth();
  const auditQ = useAuditEvents({ limit: 5 });

  const tenant = tenantsQ.data?.data[0];
  const tenantName = tenant?.name ?? user?.tenant?.name ?? 'Tenant';

  const usersTotal = usersQ.data?.pagination.has_more
    ? `${usersQ.data?.data.length}+`
    : usersQ.data?.data.length ?? 0;
  // Tolerate either { data: [...] } or a bare array — older deployments
  // returned the latter and the page was crashing on .filter of undefined.
  const healthRows = Array.isArray(healthQ.data)
    ? healthQ.data
    : (healthQ.data?.data ?? []);
  const integrationsActive = healthRows.filter((i) => i.status === 'active').length;
  const integrationsTotal = healthRows.length;
  const openIncidents = healthRows.filter(
    (i) => i.status === 'error' || i.last_sync_status === 'failed',
  ).length;

  const kpis: KPI[] = [
    {
      label: 'Активных пользователей',
      v: usersTotal,
    },
    {
      label: 'Интеграций',
      v: integrationsTotal === 0 ? '—' : integrationsActive,
      sub: integrationsTotal === 0 ? undefined : `/${integrationsTotal}`,
    },
    {
      label: 'Проверок за день',
      v: '—',
    },
    {
      label: 'Инцидентов',
      v: openIncidents,
    },
  ];

  const integrations = (integrationsQ.data?.data ?? []).slice(0, 6);
  const auditEvents = auditQ.data?.data ?? [];

  return (
    <Page width="regular">
      <PageHeader
        title={tenantName}
        action={
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary font-normal rounded-full"
          >
            Institutional
          </Badge>
        }
      />

      {/* KPIs — Kaggle horizontal strip */}
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
          <h2 className="text-xl font-bold">Состояние интеграций</h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            data-testid="admin-home-integrations-link"
          >
            <Link to="/admin/integrations">
              все
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {integrations.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Нет настроенных интеграций.
            </CardContent>
          </Card>
        ) : (
          <Card
            className="border-border/70"
            data-testid="admin-home-integrations"
          >
            <CardContent className="p-0">
              {integrations.map((it, idx) => (
                <div
                  key={it.id}
                  className={`flex items-center gap-4 px-5 py-4 ${
                    idx > 0 ? 'border-t border-border/70' : ''
                  }`}
                >
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${statusDot(it.status)}`}
                  />
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
            </CardContent>
          </Card>
        )}
      </section>

      {/* Audit log */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Журнал событий</h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            data-testid="admin-home-audit-link"
          >
            <Link to="/admin/audit">
              перейти
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {auditEvents.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Событий пока нет.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70" data-testid="admin-home-audit">
            <CardContent className="p-0">
              {auditEvents.map((e, idx) => {
                const tone =
                  e.result === 'failure'
                    ? 'text-sev-high'
                    : e.action.startsWith('llm.') || e.action.startsWith('ai.')
                      ? 'text-primary'
                      : 'text-muted-foreground';
                return (
                  <div
                    key={e.id}
                    className={`grid items-center gap-4 px-5 py-3 text-sm ${
                      idx > 0 ? 'border-t border-border/70' : ''
                    }`}
                    style={{
                      gridTemplateColumns: '110px 1fr 200px 80px 16px',
                    }}
                  >
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {dayjs(e.occurred_at).fromNow()}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {e.action}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {e.resource.type} {e.resource.id ?? ''}
                      </div>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {e.actor.display_name ?? e.actor.id ?? e.actor.type}
                    </span>
                    <span
                      className={`text-right text-xs font-medium ${tone}`}
                    >
                      {e.result}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </Page>
  );
}

export default AdminDashboardPage;
