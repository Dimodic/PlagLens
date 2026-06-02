/**
 * /admin/audit/actors/:userId — events by a specific user.
 */
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { AuditEventCard } from '@/components/admin/AuditEventCard';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuditByActor } from '@/hooks/api/useAudit';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export function AuditByActorPage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  useDocumentTitle('Audit · Actor');
  const { data, isLoading, error } = useAuditByActor(userId, { limit: 50 });

  return (
    <Page width="wide">
      <PageHeader title="Audit · Actor" />
      <p className="text-sm font-mono text-muted-foreground">actor_id: {userId}</p>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title={t('audit_by_actor.empty')} />
      ) : (
        <div className="space-y-3">
          {data?.data.map((e) => <AuditEventCard key={e.id} event={e} />)}
        </div>
      )}
    </Page>
  );
}

export default AuditByActorPage;
