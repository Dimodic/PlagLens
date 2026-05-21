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
import type { Problem } from '@/api/types';

export function TenantsListPage() {
  useDocumentTitle('Учреждения');
  const { data, isLoading, error } = useTenants({ limit: 100 });

  return (
    <Page width="wide">
      <PageHeader
        title={<span data-testid="tenants-title">Учреждения</span>}
        action={
          <Button asChild data-testid="tenants-new-button">
            <Link to="/admin/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              Новое учреждение
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
          <EmptyState
            title="Учреждений пока нет"
            action={
              <Button asChild>
                <Link to="/admin/tenants/new">Создать учреждение</Link>
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border/50">
            {data?.data.map((t) => (
              <Link
                key={t.id}
                to={`/admin/tenants/${t.id}`}
                data-testid={`tenant-row-${t.id}`}
                className="flex items-center gap-5 px-3 py-4 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium tracking-tight">{t.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.users_count ?? 0} польз. · создано{' '}
                    {dayjs(t.created_at).format('DD.MM.YYYY')}
                  </div>
                </div>
                <StatusPill tone={t.status === 'active' ? 'success' : 'neutral'}>
                  {t.status === 'active' ? 'активно' : t.status}
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
