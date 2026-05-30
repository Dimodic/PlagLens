/**
 * TenantDashboardPage — admin tenant overview.
 *
 * Shown at /admin (uses user's own tenant) or /admin/dashboard/tenant/:id.
 */
import { useState } from 'react';
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import {
  Building2,
  Database,
  FileText,
  Loader2,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  useTenantDashboard,
  useTenantIntegrationsHealth,
} from '@/hooks/api/useDashboards';
import { useTenants } from '@/hooks/api/useTenants';
import { StatusPill } from '@/components/common/StatusPill';
import { StatsPanel } from '@/components/common/StatsPanel';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  // Which tenant the dashboard shows. Seeds from the URL param (deep
  // link) or the admin's own tenant, then the dropdown takes over —
  // an admin's own «system» tenant is usually empty, so they need a
  // one-click way to look at a tenant that actually has data.
  const [selected, setSelected] = useState<string | undefined>(
    paramId ?? user?.tenant.id,
  );
  const tenantsQ = useTenants({ limit: 100 });
  const tenants = tenantsQ.data?.data ?? [];
  const tenantId = selected ?? paramId ?? user?.tenant.id;
  const dash = useTenantDashboard(tenantId);
  const integrations = useTenantIntegrationsHealth(tenantId);

  const data = dash.data;

  const tenantPicker =
    tenants.length > 1 ? (
      <Select value={tenantId} onValueChange={setSelected}>
        <SelectTrigger
          className="h-9 w-[220px]"
          data-testid="tenant-dashboard-picker"
        >
          <SelectValue placeholder="Выберите организацию" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  return (
    <Page width="regular">
      <PageHeader title="Дашборд тенанта" action={tenantPicker} />

      <StatsPanel
        data-testid="tenant-dashboard-kpis"
        items={[
          {
            icon: <Building2 className="h-4 w-4" />,
            label: 'Курсов',
            value: fmt(data?.active_courses),
          },
          {
            icon: <FileText className="h-4 w-4" />,
            label: 'Посылок',
            value: fmt(data?.submissions_total),
          },
          {
            icon: <UserCheck className="h-4 w-4" />,
            label: 'DAU',
            value: fmt(data?.active_users_dau),
            tooltip: 'Daily Active Users — уникальных пользователей зашло за последние 24 часа',
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'MAU',
            value: fmt(data?.active_users_mau),
            tooltip: 'Monthly Active Users — уникальных пользователей зашло за последние 30 дней',
          },
          {
            icon: <ShieldCheck className="h-4 w-4" />,
            label: 'Проверок',
            value: fmt(data?.plagiarism_runs_total),
            tooltip: 'Запусков проверки на заимствования',
          },
          {
            icon: <Database className="h-4 w-4" />,
            label: 'Хранилище',
            value:
              data?.storage_used_bytes !== undefined
                ? `${(data.storage_used_bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
                : '—',
            tooltip: 'Объём файлов в MinIO (решения студентов, экспорты, отчёты)',
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
