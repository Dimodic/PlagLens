/**
 * /admin/audit/resources/:type/:id — events for a specific resource.
 */
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { AuditEventCard } from '@/components/admin/AuditEventCard';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuditByResource } from '@/hooks/api/useAudit';
import type { Problem } from '@/api/types';

export function AuditByResourcePage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  useDocumentTitle('Audit · Resource');
  const { data, isLoading, error } = useAuditByResource(type, id, {
    limit: 50,
  });

  return (
    <Page width="wide">
      <PageHeader title="Audit · Resource" />
      <p className="text-sm font-mono text-muted-foreground">{type}/{id}</p>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title="Событий нет" />
      ) : (
        <div className="space-y-3">
          {data?.data.map((e) => <AuditEventCard key={e.id} event={e} />)}
        </div>
      )}
    </Page>
  );
}

export default AuditByResourcePage;
