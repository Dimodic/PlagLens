/**
 * GlobalDashboardPage — super_admin cross-tenant overview.
 */
import { Link } from 'react-router-dom';
import {
  Brain,
  Building,
  DollarSign,
  Shield,
  Users,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useGlobalDashboard } from '@/hooks/api/useDashboards';
import { KPICard } from '@/components/dashboard/KPICard';
import { Button } from '@/components/ui/button';

export default function GlobalDashboardPage() {
  useDocumentTitle('Глобальный дашборд');
  const { data, isLoading } = useGlobalDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Глобальный дашборд
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Сводка по всем тенантам.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/metrics">System health</Link>
          </Button>
        </div>
      </div>

      <div
        data-testid="global-dashboard-kpis"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <KPICard
          label="Тенантов"
          value={data?.tenants_count}
          icon={<Building className="h-4 w-4" />}
          loading={isLoading}
          testId="kpi-tenants-count"
        />
        <KPICard
          label="Активных пользователей"
          value={data?.active_users_total}
          icon={<Users className="h-4 w-4" />}
          loading={isLoading}
          testId="kpi-active-users-total"
        />
        <KPICard
          label="Посылок (30д)"
          value={data?.submissions_total_30d}
          icon={<Building className="h-4 w-4" />}
          color="blue"
          loading={isLoading}
          testId="kpi-submissions-total-30d"
        />
        <KPICard
          label="AI cost (30д)"
          value={
            data?.ai_cost_total_30d !== undefined
              ? `$${data.ai_cost_total_30d.toFixed(2)}`
              : null
          }
          icon={<DollarSign className="h-4 w-4" />}
          color="green"
          loading={isLoading}
          testId="kpi-ai-cost-total-30d"
        />
        <KPICard
          label="Plagiarism runs (30д)"
          value={data?.plagiarism_runs_total_30d}
          icon={<Shield className="h-4 w-4" />}
          color="red"
          loading={isLoading}
          testId="kpi-plagiarism-runs-total-30d"
        />
        <KPICard
          label="AI"
          value="—"
          icon={<Brain className="h-4 w-4" />}
          hint="Подробнее см. /admin/ai/budgets"
          loading={isLoading}
          testId="kpi-ai-hint"
        />
      </div>
    </div>
  );
}
