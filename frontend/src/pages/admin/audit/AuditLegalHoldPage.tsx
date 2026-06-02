/**
 * /admin/audit/legal-holds — list active holds, create new.
 */
import { useState } from 'react';
import dayjs from 'dayjs';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useCreateLegalHold,
  useDeleteLegalHold,
  useLegalHolds,
} from '@/hooks/api/useAudit';
import type { Problem } from '@/api/types';

export function AuditLegalHoldPage() {
  const { t } = useTranslation();
  useDocumentTitle('Legal holds');
  const notify = useNotifications();
  const { data, isLoading, error, refetch } = useLegalHolds();
  const createM = useCreateLegalHold();
  const deleteM = useDeleteLegalHold();

  const [opened, setOpened] = useState(false);
  const [resourceId, setResourceId] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const handleCreate = async () => {
    setProblem(null);
    try {
      await createM.mutateAsync({
        resource_id: resourceId.trim(),
        reason: reason.trim(),
      });
      notify.success(t('audit_legal_hold.created'));
      setOpened(false);
      setResourceId('');
      setReason('');
      refetch();
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteM.mutateAsync(id);
      notify.success(t('audit_legal_hold.removed'));
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('audit_legal_hold.delete_failed'));
    }
  };

  return (
    <Page width="wide">
      <PageHeader
        title={<span data-testid="legal-holds-title">Legal holds</span>}
        action={
          <Button onClick={() => setOpened(true)} data-testid="legal-hold-create-button">
            <Plus className="mr-2 h-4 w-4" />
            {t('audit_legal_hold.create_button')}
          </Button>
        }
      />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState title={t('audit_legal_hold.empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((h) => (
                  <TableRow key={h.id} data-testid={`hold-row-${h.id}`}>
                    <TableCell>
                      <span className="text-xs font-mono">{h.resource_id}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{h.reason}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {dayjs(h.started_at).format('DD.MM.YYYY')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono">{h.requested_by}</span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(h.id)}
                        disabled={deleteM.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        {deleteM.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        {t('audit_legal_hold.remove')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={opened} onOpenChange={(o) => { if (!o) setOpened(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('audit_legal_hold.dialog_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {problem && <ProblemAlert problem={problem} />}
            <div className="space-y-1.5">
              <Label htmlFor="hold-resource-id">resource_id</Label>
              <Input
                id="hold-resource-id"
                value={resourceId}
                onChange={(e) => setResourceId(e.currentTarget.value)}
                data-testid="legal-hold-resource-id"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hold-reason">reason</Label>
              <Textarea
                id="hold-reason"
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                rows={3}
                data-testid="legal-hold-reason"
              />
            </div>
            <div className="flex items-center justify-end">
              <Button
                onClick={handleCreate}
                disabled={createM.isPending}
                data-testid="legal-hold-submit"
              >
                {createM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

export default AuditLegalHoldPage;
