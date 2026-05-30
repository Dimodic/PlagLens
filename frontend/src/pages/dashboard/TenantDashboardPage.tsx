/**
 * TenantDashboardPage — admin «Обзор».
 *
 * Defaults to a whole-instance roll-up («Все организации»); the picker
 * narrows to a single tenant. Shown at /admin and
 * /admin/dashboard/tenant/:id (deep link pins that tenant).
 */
import { useState } from 'react';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';
import {
  Building2,
  Database,
  FileText,
  Loader2,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  useInstanceIntegrationsHealth,
  useInstanceOverview,
  useTenantDashboard,
  useTenantIntegrationsHealth,
} from '@/hooks/api/useDashboards';
import { useTenants } from '@/hooks/api/useTenants';
import { StatsPanel } from '@/components/common/StatsPanel';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function statusDot(status: string): string {
  if (status === 'healthy') return 'bg-sev-low';
  if (status === 'degraded') return 'bg-sev-mid';
  return 'bg-sev-high';
}

function statusText(status: string): string {
  if (status === 'healthy') return 'работает';
  if (status === 'degraded') return 'ожидает';
  return 'ошибка';
}

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
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
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
  useDocumentTitle('Обзор');
  const { id: paramId } = useParams<{ id: string }>();
  // What the dashboard shows. Default is the whole-instance roll-up
  // («Все организации») — the admin's own tenant is usually empty, so
  // global is the useful landing view. A deep link with :id pins to
  // that tenant; otherwise the dropdown drives it.
  const [selected, setSelected] = useState<string>(paramId ?? ALL);
  const isAll = selected === ALL;

  const tenantsQ = useTenants({ limit: 100 });
  const tenants = tenantsQ.data?.data ?? [];

  // Two query pairs, gated so only the active scope fetches.
  const instanceDash = useInstanceOverview(isAll);
  const instanceInteg = useInstanceIntegrationsHealth(isAll);
  const tenantDash = useTenantDashboard(isAll ? undefined : selected);
  const tenantInteg = useTenantIntegrationsHealth(isAll ? undefined : selected);

  const data = isAll ? instanceDash.data : tenantDash.data;
  const integrations = isAll ? instanceInteg : tenantInteg;

  const tenantPicker = (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger
        className="h-9 w-[240px]"
        data-testid="tenant-dashboard-picker"
      >
        <SelectValue placeholder="Все организации" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все организации</SelectItem>
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
      <PageHeader title="Обзор" action={tenantPicker} />

      <StatsPanel
        data-testid="tenant-dashboard-kpis"
        items={[
          {
            icon: <Building2 className="h-4 w-4" />,
            label: 'Курсов',
            value: fmtCount(data?.active_courses),
          },
          {
            icon: <FileText className="h-4 w-4" />,
            label: 'Посылок',
            value: fmtCount(data?.submissions_total),
          },
          {
            icon: <UserCheck className="h-4 w-4" />,
            label: 'DAU',
            value: fmtCount(data?.active_users_dau),
            tooltip: 'Daily Active Users — уникальных пользователей зашло за последние 24 часа',
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'MAU',
            value: fmtCount(data?.active_users_mau),
            tooltip: 'Monthly Active Users — уникальных пользователей зашло за последние 30 дней',
          },
          {
            icon: <ShieldCheck className="h-4 w-4" />,
            label: 'Проверок',
            value: fmtCount(data?.plagiarism_runs_total),
            tooltip: 'Запусков проверки на заимствования',
          },
          {
            icon: <Database className="h-4 w-4" />,
            label: 'Хранилище',
            value: fmtBytes(data?.storage_used_bytes),
            tooltip: 'Объём файлов в MinIO (решения студентов, экспорты, отчёты)',
          },
        ]}
      />

      {/* Integration health — flat list, no card chrome (minimalism). */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          Состояние интеграций
        </h2>
        {integrations.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : !integrations.data?.length ? (
          <p className="text-sm text-muted-foreground">Нет настроенных интеграций.</p>
        ) : (
          <div className="divide-y divide-border/50" data-testid="tenant-integrations">
            {integrations.data.map((it) => (
              <div
                key={it.integration}
                className="flex items-center gap-4 py-3"
                data-testid={`integration-${it.integration}`}
              >
                <span
                  className={`h-2 w-2 flex-none rounded-full ${statusDot(it.status)}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {it.integration}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {statusText(it.status)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums w-[92px] text-right">
                  {it.last_check_at ? dayjs(it.last_check_at).format('DD.MM HH:mm') : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
