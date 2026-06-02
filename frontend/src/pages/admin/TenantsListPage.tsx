/**
 * /admin/tenants — institutions managed by the admin. Flat list (no card
 * chrome). The bootstrap "system" platform tenant is hidden server-side, so
 * this list starts empty until the admin creates an institution.
 */
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/common/StatusPill';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTenants } from '@/hooks/api/useTenants';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export function TenantsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('tenants_list.title'));
  const { data, isLoading, error } = useTenants({ limit: 100 });

  return (
    <Page width="wide">
      <PageHeader
        title={<span data-testid="tenants-title">{t('tenants_list.title')}</span>}
        action={
          <Button asChild data-testid="tenants-new-button">
            <Link to="/admin/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('tenants_list.new')}
            </Link>
          </Button>
        }
      />

      <div className="space-y-4">
        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data && data.data.length === 0 ? (
          // Empty state is text-only: the header already owns the single
          // primary «+ Новое учреждение» button, repeating it inside the
          // empty state was the dup the user flagged.
          <EmptyState title={t('tenants_list.empty')} />
        ) : (
          <div className="divide-y divide-border/50">
            {data?.data.map((tenant) => (
              <Link
                key={tenant.id}
                to={`/admin/tenants/${tenant.id}`}
                data-testid={`tenant-row-${tenant.id}`}
                className="flex items-center gap-5 px-3 py-4 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium tracking-tight">{tenant.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t('tenants_list.meta', {
                      count: tenant.users_count ?? 0,
                      date: dayjs(tenant.created_at).format('DD.MM.YYYY'),
                    })}
                  </div>
                </div>
                <StatusPill tone={tenant.status === 'active' ? 'success' : 'neutral'}>
                  {tenant.status === 'active' ? t('tenants_list.status_active') : tenant.status}
                </StatusPill>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}

export default TenantsListPage;
