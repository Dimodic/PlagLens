/**
 * /admin/integrations/webhooks — incoming webhook events log.
 */
import { useState } from 'react';
import dayjs from 'dayjs';
import { Check, Loader2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useWebhookEvents } from '@/hooks/api/useIntegrations';
import type { WebhookEvent } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

const STATUS_TONES: Record<WebhookEvent['status'], StatusTone> = {
  received: 'info',
  processed: 'success',
  ignored: 'neutral',
  failed: 'destructive',
};

export function WebhooksAdminPage() {
  const { t } = useTranslation();
  useDocumentTitle('Webhook events');
  const [kind, setKind] = useState<WebhookEvent['kind'] | null>(null);

  const { data, isLoading, error } = useWebhookEvents({
    kind: kind ?? undefined,
    limit: 50,
  });

  return (
    <Page width="wide">
      <PageHeader title="Webhook events" />

      <div className="space-y-4">
        <div className="flex items-center gap-3">
              <Select
                value={kind ?? 'all'}
                onValueChange={(v) =>
                  setKind(v === 'all' ? null : (v as WebhookEvent['kind']))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('webhooks_admin.all_kinds')}</SelectItem>
                  <SelectItem value="stepik">stepik</SelectItem>
                  <SelectItem value="yandex_contest">yandex_contest</SelectItem>
                  <SelectItem value="plagiarism">plagiarism</SelectItem>
                  <SelectItem value="llm">llm</SelectItem>
                  <SelectItem value="telegram">telegram</SelectItem>
                </SelectContent>
              </Select>
              {kind && (
                <Button variant="ghost" size="sm" onClick={() => setKind(null)}>
                  {t('webhooks_admin.reset')}
                </Button>
              )}
            </div>

        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data && data.data.length === 0 ? (
          <EmptyState title={t('webhooks_admin.empty')} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>{t('webhooks_admin.col_signature')}</TableHead>
                    <TableHead>{t('webhooks_admin.col_status')}</TableHead>
                    <TableHead>{t('webhooks_admin.col_received')}</TableHead>
                    <TableHead>{t('webhooks_admin.col_processed')}</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((e) => (
                    <TableRow key={e.id} data-testid={`webhook-row-${e.id}`}>
                      <TableCell>
                        <StatusPill tone="neutral">{e.kind}</StatusPill>
                      </TableCell>
                      <TableCell>
                        {e.signature_valid ? (
                          <StatusPill tone="success">
                            <Check className="mr-1 h-3 w-3" />
                            valid
                          </StatusPill>
                        ) : (
                          <StatusPill tone="destructive">
                            <X className="mr-1 h-3 w-3" />
                            invalid
                          </StatusPill>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={STATUS_TONES[e.status]}>
                          {e.status}
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(e.received_at).format('DD.MM HH:mm:ss')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {e.processed_at
                            ? dayjs(e.processed_at).format('DD.MM HH:mm:ss')
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono text-muted-foreground">
                          {e.id.slice(0, 10)}…
                        </span>
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

export default WebhooksAdminPage;
