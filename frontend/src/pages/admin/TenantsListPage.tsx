/**
 * /admin/tenants — list of tenants (super_admin only).
 */
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/common/StatusPill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTenants } from '@/hooks/api/useTenants';
import type { Problem } from '@/api/types';

export function TenantsListPage() {
  useDocumentTitle('Тенанты');
  const { data, isLoading, error } = useTenants({ limit: 100 });

  return (
    <Page width="wide">
      <PageHeader
        title={<span data-testid="tenants-title">Тенанты</span>}
        action={
          <Button asChild data-testid="tenants-new-button">
            <Link to="/admin/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              Новый тенант
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
            title="Тенантов нет"
            action={
              <Button asChild>
                <Link to="/admin/tenants/new">Создать тенант</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Пользователей</TableHead>
                    <TableHead>Создан</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((t) => (
                    <TableRow key={t.id} data-testid={`tenant-row-${t.id}`}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>
                        <StatusPill tone={t.status === 'active' ? 'success' : 'neutral'}>
                          {t.status}
                        </StatusPill>
                      </TableCell>
                      <TableCell>{t.users_count ?? '—'}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(t.created_at).format('DD.MM.YYYY')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          data-testid={`tenant-open-${t.id}`}
                        >
                          <Link to={`/admin/tenants/${t.id}`}>Открыть</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}

export default TenantsListPage;
