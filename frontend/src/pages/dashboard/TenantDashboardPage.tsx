/**
 * TenantDashboardPage — admin tenant overview.
 *
 * Shown at /admin (uses user's own tenant) or /admin/dashboard/tenant/:id.
 */
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import {
  Brain,
  Building,
  Database,
  DollarSign,
  Loader2,
  Shield,
  Users,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  useTenantDashboard,
  useTenantIntegrationsHealth,
} from '@/hooks/api/useDashboards';
import { StatusPill } from '@/components/common/StatusPill';
import { StatsPanel } from '@/components/common/StatsPanel';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function integrationBadge(status: string) {
  if (status === 'healthy')
    return <StatusPill tone="success">{status}</StatusPill>;
  if (status === 'degraded')
    return <StatusPill tone="warning">{status}</StatusPill>;
  return <StatusPill tone="destructive">{status}</StatusPill>;
}

function fmt(v: number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  return String(v);
}

export default function TenantDashboardPage() {
  useDocumentTitle('Дашборд тенанта');
  const { user } = useAuth();
  const { id: paramId } = useParams<{ id: string }>();
  const tenantId = paramId ?? user?.tenant.id;
  const dash = useTenantDashboard(tenantId);
  const integrations = useTenantIntegrationsHealth(tenantId);

  const data = dash.data;

  return (
    <Page width="regular">
      <PageHeader title="Дашборд тенанта" />

      <StatsPanel
        data-testid="tenant-dashboard-kpis"
        items={[
          {
            icon: <Building className="h-4 w-4" />,
            label: 'Курсов',
            value: fmt(data?.active_courses),
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'DAU',
            value: fmt(data?.active_users_dau),
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'MAU',
            value: fmt(data?.active_users_mau),
          },
          {
            icon: <Building className="h-4 w-4" />,
            label: 'Посылок 30д',
            value: fmt(data?.submissions_30d),
          },
        ]}
      />

      <StatsPanel
        items={[
          {
            icon: <Brain className="h-4 w-4" />,
            label: 'AI токенов 30д',
            value: fmt(data?.ai_tokens_total_30d),
          },
          {
            icon: <DollarSign className="h-4 w-4" />,
            label: 'AI стоимость 30д',
            value:
              data?.ai_cost_total_30d !== undefined
                ? `$${data.ai_cost_total_30d.toFixed(2)}`
                : '—',
          },
          {
            icon: <Shield className="h-4 w-4" />,
            label: 'Plagiarism 30д',
            value: fmt(data?.plagiarism_runs_30d),
          },
          {
            icon: <Database className="h-4 w-4" />,
            label: 'Хранилище',
            value:
              data?.storage_used_bytes !== undefined
                ? `${(data.storage_used_bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
                : '—',
          },
        ]}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Состояние интеграций</h2>
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/admin/dashboard/global">Глобальный дашборд</Link>
          </Button>
        </div>
        {integrations.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : !integrations.data?.length ? (
          <p className="text-sm text-muted-foreground">Нет данных.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Интеграция</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Последняя проверка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.data.map((it) => (
                  <TableRow
                    key={it.integration}
                    data-testid={`integration-${it.integration}`}
                  >
                    <TableCell>{it.integration}</TableCell>
                    <TableCell>{integrationBadge(it.status)}</TableCell>
                    <TableCell>
                      {dayjs(it.last_check_at).format('DD.MM HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </Page>
  );
}
