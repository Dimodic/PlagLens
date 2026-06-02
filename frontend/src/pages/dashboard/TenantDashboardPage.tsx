/**
 * TenantDashboardPage — admin «Обзор».
 *
 * Defaults to a whole-instance roll-up («Все организации»); the picker
 * narrows to a single tenant. Shown at /admin and
 * /admin/dashboard/tenant/:id (deep link pins that tenant).
 *
 * Note: there's no «integration health» block here. Integration
 * *instances* are created per-teacher, so a single tenant-wide status
 * per kind was misleading. What the admin actually sets up — the OAuth
 * apps (Client ID/Secret) — lives in «Интеграции → Авторизация».
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Building2,
  Database,
  FileText,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { t, useTranslation } from '@/i18n';
import {
  useActivity,
  useInstanceOverview,
  useLiveMetrics,
  useTenantDashboard,
} from '@/hooks/api/useDashboards';
import { useTenants } from '@/hooks/api/useTenants';
import { StatsPanel } from '@/components/common/StatsPanel';
import { AdminActivityCharts } from '@/components/dashboard/AdminActivityCharts';
import { LiveMetricsCharts } from '@/components/dashboard/LiveMetricsCharts';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Count formatter: grouped (« 3 174 ») up to 100k, then compact
 *  (« 104 тыс. », « 1,2 млн ») so a six-figure submission count can't
 *  blow out the KPI tile. */
function fmtCount(v: number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  if (v >= 100_000) {
    return new Intl.NumberFormat('ru-RU', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);
  }
  return new Intl.NumberFormat('ru-RU').format(v);
}

/** Bytes → human units (Russian), picking the unit so the value never
 *  reads as a useless « 0.00 GB ». */
function fmtBytes(b: number | undefined | null): string {
  if (b === undefined || b === null) return '—';
  if (b <= 0) return '0';
  const units = t('common.byte_units').split(',');
  let n = b;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i > 0 && n < 100 ? 1 : 0;
  return `${n.toFixed(digits).replace('.', ',')} ${units[i]}`;
}

/** Sentinel select value for the «whole instance» (all tenants) view. */
const ALL = '__all__';

export default function TenantDashboardPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('tenant_dashboard.title'));
  const { id: paramId } = useParams<{ id: string }>();
  // What the dashboard shows. Default is the whole-instance roll-up
  // («Все организации») — the admin's own tenant is usually empty, so
  // global is the useful landing view. A deep link with :id pins to
  // that tenant; otherwise the dropdown drives it.
  const [selected, setSelected] = useState<string>(paramId ?? ALL);
  const isAll = selected === ALL;

  const tenantsQ = useTenants({ limit: 100 });
  const tenants = tenantsQ.data?.data ?? [];

  // Gated so only the active scope fetches.
  const instanceDash = useInstanceOverview(isAll);
  const tenantDash = useTenantDashboard(isAll ? undefined : selected);
  const data = isAll ? instanceDash.data : tenantDash.data;
  // Chart data follows the same scope (undefined tenant ⇒ whole instance).
  const activity = useActivity(isAll ? undefined : selected);
  // Live infra metrics are instance-wide (no tenant dimension) — always shown,
  // polled on its own interval inside the hook.
  const live = useLiveMetrics();

  const tenantPicker = (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger
        className="h-9 w-[240px]"
        data-testid="tenant-dashboard-picker"
      >
        <SelectValue placeholder={t('tenant_dashboard.all_tenants')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('tenant_dashboard.all_tenants')}</SelectItem>
        {tenants.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Page width="regular">
      <PageHeader title={t('tenant_dashboard.title')} action={tenantPicker} />

      <StatsPanel
        data-testid="tenant-dashboard-kpis"
        items={[
          {
            icon: <Building2 className="h-4 w-4" />,
            label: t('tenant_dashboard.kpi_courses'),
            value: fmtCount(data?.active_courses),
          },
          {
            icon: <FileText className="h-4 w-4" />,
            label: t('tenant_dashboard.kpi_submissions'),
            value: fmtCount(data?.submissions_total),
          },
          {
            icon: <UserCheck className="h-4 w-4" />,
            label: t('tenant_dashboard.kpi_dau'),
            value: fmtCount(data?.active_users_dau),
            tooltip: t('tenant_dashboard.kpi_dau_tooltip'),
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: t('tenant_dashboard.kpi_mau'),
            value: fmtCount(data?.active_users_mau),
            tooltip: t('tenant_dashboard.kpi_mau_tooltip'),
          },
          {
            icon: <ShieldCheck className="h-4 w-4" />,
            label: t('tenant_dashboard.kpi_checks'),
            value: fmtCount(data?.plagiarism_runs_total),
            tooltip: t('tenant_dashboard.kpi_checks_tooltip'),
          },
          {
            icon: <Database className="h-4 w-4" />,
            label: t('tenant_dashboard.kpi_storage'),
            value: fmtBytes(data?.storage_used_bytes),
            tooltip: t('tenant_dashboard.kpi_storage_tooltip'),
          },
        ]}
      />

      <LiveMetricsCharts data={live.data} loading={live.isLoading} />

      <AdminActivityCharts data={activity.data} loading={activity.isLoading} />
    </Page>
  );
}
