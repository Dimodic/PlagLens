/**
 * /admin/audit/access-denied — list 403's for security review.
 */
import { Loader2 } from 'lucide-react';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { AuditEventCard } from '@/components/admin/AuditEventCard';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuditAccessDenied } from '@/hooks/api/useAudit';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export function AuditAccessDeniedPage() {
  const { t } = useTranslation();
  useDocumentTitle('Access denied');
  const { data, isLoading, error } = useAuditAccessDenied({ limit: 50 });

  return (
    <Page width="wide">
      <PageHeader title="Access denied" />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title={t('audit_access_denied.empty')} />
      ) : (
        <div className="space-y-3">
          {data?.data.map((e) => <AuditEventCard key={e.id} event={e} />)}
        </div>
      )}
    </Page>
  );
}

export default AuditAccessDeniedPage;
