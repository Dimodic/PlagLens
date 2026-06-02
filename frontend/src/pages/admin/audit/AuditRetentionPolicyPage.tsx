/**
 * /admin/audit/retention — edit retention policy.
 */
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { RetentionPolicyForm } from '@/components/admin/RetentionPolicyForm';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useRetentionPolicy,
  useUpdateRetentionPolicy,
} from '@/hooks/api/useAudit';
import type { Problem } from '@/api/types';

export function AuditRetentionPolicyPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('audit_retention.title'));
  const notify = useNotifications();
  const { data, isLoading, error } = useRetentionPolicy();
  const update = useUpdateRetentionPolicy();

  return (
    <Page width="narrow">
      <PageHeader title={t('audit_retention.title')} />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <RetentionPolicyForm
              initial={data}
              loading={update.isPending}
              onSubmit={async (body) => {
                try {
                  await update.mutateAsync(body);
                  notify.success(t('audit_retention.saved'));
                } catch (e) {
                  notify.error((e as Problem)?.detail ?? t('audit_retention.save_failed'));
                }
              }}
            />
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

export default AuditRetentionPolicyPage;
