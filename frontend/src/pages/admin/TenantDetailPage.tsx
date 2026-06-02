/**
 * /admin/tenants/:id — institution detail. Tabs: Пользователи, Приглашения,
 * Статистика, Аудит. Wide, flat layout (no card chrome).
 *
 * No «Настройки» tab: the tenant id sits under the title (copy-able) and the
 * only lifecycle control — suspend / activate — lives in the header. Stats
 * come from the Reporting tenant overview (live cross-schema counts) plus the
 * activity charts; audit reuses the same table as /admin/audit, scoped to this
 * tenant via the X-Cross-Tenant header.
 */
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Database,
  FileText,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import { StatsPanel } from '@/components/common/StatsPanel';
import { CopyButton } from '@/components/common/CopyButton';
import { EmptyState } from '@/components/common/EmptyState';
import { Page } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { AuditEventsTable } from '@/components/admin/AuditEventsTable';
import { AdminActivityCharts } from '@/components/dashboard/AdminActivityCharts';
import { TenantInvitationsPanel } from '@/components/admin/TenantInvitationsPanel';
import { TenantUsersPanel } from '@/components/admin/TenantUsersPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useActivateTenant,
  useSuspendTenant,
  useTenant,
} from '@/hooks/api/useTenants';
import { useActivity, useTenantDashboard } from '@/hooks/api/useDashboards';
import { useTenantAuditEvents } from '@/hooks/api/useAudit';
import type { Problem } from '@/api/types';

/** Bytes → human units; picks the unit so it never reads « 0.00 ГБ ». */
function fmtBytes(b: number | undefined | null, unitsCsv: string): string {
  if (b === undefined || b === null) return '—';
  if (b <= 0) return '0';
  const units = unitsCsv.split(',');
  let n = b;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i > 0 && n < 100 ? 1 : 0;
  return `${n.toFixed(digits).replace('.', ',')} ${units[i]}`;
}

const fmtNum = (v: number | undefined | null): string =>
  v === undefined || v === null ? '—' : new Intl.NumberFormat('ru-RU').format(v);

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  useDocumentTitle(t('tenant_detail.title'));
  const notify = useNotifications();
  const tenantQ = useTenant(id);
  const suspend = useSuspendTenant();
  const activate = useActivateTenant();

  // Inline data: live stats + activity charts + this tenant's audit log.
  const statsQ = useTenantDashboard(id);
  const activityQ = useActivity(id);
  const auditQ = useTenantAuditEvents(id, { limit: 25 });

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
      <Link to="/admin/tenants">
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {t('tenant_detail.back_to_tenants')}
      </Link>
    </Button>
  );

  if (tenantQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (tenantQ.error) {
    return (
      <Page width="wide">
        {backLink}
        <ProblemAlert problem={tenantQ.error as unknown as Problem} />
      </Page>
    );
  }
  const tenant = tenantQ.data;
  if (!tenant) return null;

  const handleSuspend = async () => {
    if (!id) return;
    try {
      await suspend.mutateAsync(id);
      notify.success(t('tenant_detail.suspended'));
      tenantQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('tenant_detail.failed'));
    }
  };
  const handleActivate = async () => {
    if (!id) return;
    try {
      await activate.mutateAsync(id);
      notify.success(t('tenant_detail.activated'));
      tenantQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('tenant_detail.failed'));
    }
  };

  const stats = statsQ.data;
  const auditEvents = auditQ.data?.data ?? [];

  return (
    <Page width="wide">
      {backLink}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            data-testid="tenant-detail-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {tenant.name}
          </h1>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="font-mono text-xs text-muted-foreground">{tenant.id}</code>
            <CopyButton value={tenant.id} className="h-6 w-6" />
          </div>
          <div className="mt-2" data-testid="tenant-status-badge">
            <StatusPill tone={tenant.status === 'active' ? 'success' : 'neutral'}>
              {tenant.status === 'active' ? t('tenant_detail.status_active') : tenant.status}
            </StatusPill>
          </div>
        </div>
        {tenant.status === 'active' ? (
          <Button
            variant="outline"
            disabled={suspend.isPending}
            onClick={handleSuspend}
            data-testid="tenant-suspend-button"
            className="text-amber-600 border-amber-600 hover:text-amber-600"
          >
            {suspend.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('tenant_detail.suspend')}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={activate.isPending}
            onClick={handleActivate}
            data-testid="tenant-activate-button"
            className="text-emerald-600 border-emerald-600 hover:text-emerald-600"
          >
            {activate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('tenant_detail.activate')}
          </Button>
        )}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tenant-tab-users">
            {t('tenant_detail.tab_users')}
          </TabsTrigger>
          <TabsTrigger value="invitations" data-testid="tenant-tab-invitations">
            {t('tenant_detail.tab_invitations')}
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tenant-tab-usage">
            {t('tenant_detail.tab_usage')}
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tenant-tab-audit">
            {t('tenant_detail.tab_audit')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="pt-6" data-testid="tenant-users-panel">
          <TenantUsersPanel tenantId={tenant.id} />
        </TabsContent>

        <TabsContent value="invitations" className="pt-6" data-testid="tenant-invitations-panel">
          <TenantInvitationsPanel tenantId={tenant.id} />
        </TabsContent>

        <TabsContent value="usage" className="space-y-6 pt-2" data-testid="tenant-usage-panel">
          {statsQ.isLoading && !stats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <StatsPanel
              items={[
                {
                  icon: <Users className="h-4 w-4" />,
                  label: t('tenant_detail.metric_users'),
                  value: fmtNum(stats.users_total),
                },
                {
                  icon: <Activity className="h-4 w-4" />,
                  label: t('tenant_detail.metric_active_sessions'),
                  value: fmtNum(stats.active_sessions),
                },
                {
                  icon: <BookOpen className="h-4 w-4" />,
                  label: t('tenant_detail.metric_courses'),
                  value: fmtNum(stats.active_courses),
                },
                {
                  icon: <FileText className="h-4 w-4" />,
                  label: t('tenant_detail.metric_submissions'),
                  value: fmtNum(stats.submissions_total),
                },
                {
                  icon: <ShieldCheck className="h-4 w-4" />,
                  label: t('tenant_detail.metric_checks'),
                  value: fmtNum(stats.plagiarism_runs_total),
                },
                {
                  icon: <Database className="h-4 w-4" />,
                  label: t('tenant_detail.metric_storage'),
                  value: fmtBytes(stats.storage_used_bytes, t('common.byte_units')),
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('tenant_detail.no_data')}</p>
          )}

          <AdminActivityCharts data={activityQ.data} loading={activityQ.isLoading} />
        </TabsContent>

        <TabsContent value="audit" className="space-y-3 pt-6" data-testid="tenant-audit-panel">
          <div className="flex items-center justify-end">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to={`/admin/audit?tenant_id=${tenant.id}`}>
                {t('tenant_detail.open_audit')}
              </Link>
            </Button>
          </div>
          {auditQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : auditEvents.length === 0 ? (
            <EmptyState title={t('tenant_detail.audit_empty')} />
          ) : (
            <AuditEventsTable events={auditEvents} />
          )}
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default TenantDetailPage;
