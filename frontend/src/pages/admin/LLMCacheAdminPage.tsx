/**
 * /admin/ai/cache — cache stats + purge actions.
 */
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useCacheStats, usePurgeCache } from '@/hooks/api/useAi';
import type { Problem } from '@/api/types';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function LLMCacheAdminPage() {
  useDocumentTitle('LLM cache');
  const notify = useNotifications();
  const { data, isLoading, error } = useCacheStats();
  const purge = usePurgeCache();

  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmPrompt, setConfirmPrompt] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState('');

  const handlePurgeAll = async () => {
    setConfirmAll(false);
    try {
      await purge.mutateAsync({ kind: 'all' });
      notify.success('Кэш очищен полностью');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  const handlePurgePrompt = async (id: string) => {
    setConfirmPrompt(null);
    try {
      await purge.mutateAsync({ kind: 'prompt', id });
      notify.success(`Очищено для prompt ${id}`);
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  const handlePurgeSubmission = async () => {
    if (!submissionId) return;
    try {
      await purge.mutateAsync({ kind: 'submission', id: submissionId });
      notify.success(`Очищено для submission ${submissionId}`);
      setSubmissionId('');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Page width="regular">
      <PageHeader
        title="LLM cache"
        action={
          <Button
            variant="outline"
            onClick={() => setConfirmAll(true)}
            data-testid="ai-cache-purge-all"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Очистить кэш
          </Button>
        }
      />

      <div className="space-y-4">
        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="ai-cache-stats">
              <Card data-testid="ai-cache-stat-entries">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Записей</p>
                  <p className="text-xl font-bold">{data.total_entries}</p>
                </CardContent>
              </Card>
              <Card data-testid="ai-cache-stat-size">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Размер</p>
                  <p className="text-xl font-bold">{fmtBytes(data.size_bytes)}</p>
                </CardContent>
              </Card>
              <Card data-testid="ai-cache-stat-hit-rate">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Hit rate</p>
                  <p className="text-xl font-bold">{(data.hit_rate * 100).toFixed(1)}%</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-6">
                <h4 className="mb-3 text-base font-medium">По prompt-version</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prompt version</TableHead>
                      <TableHead>Записей</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(data.by_prompt_version ?? {}).map(([id, count]) => (
                      <TableRow key={id} data-testid={`ai-cache-prompt-row-${id}`}>
                        <TableCell>{id}</TableCell>
                        <TableCell>{count}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmPrompt(id)}
                            data-testid={`ai-cache-purge-prompt-${id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Очистить
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h4 className="mb-3 text-base font-medium">По submission</h4>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="submission-id">Submission ID</Label>
                    <Input
                      id="submission-id"
                      value={submissionId}
                      onChange={(e) => setSubmissionId(e.currentTarget.value)}
                      placeholder="sub_..."
                      data-testid="ai-cache-submission-input"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handlePurgeSubmission}
                    disabled={!submissionId || purge.isPending}
                    data-testid="ai-cache-purge-submission"
                    className="text-destructive hover:text-destructive"
                  >
                    {purge.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Очистить
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <ConfirmDialog
          opened={confirmAll}
          onClose={() => setConfirmAll(false)}
          onConfirm={handlePurgeAll}
          title="Очистить весь кэш?"
          message="Все cache hits исчезнут — следующие анализы будут вызывать LLM. Действие нельзя отменить."
          confirmLabel="Очистить"
          destructive
          loading={purge.isPending}
        />
        <ConfirmDialog
          opened={confirmPrompt != null}
          onClose={() => setConfirmPrompt(null)}
          onConfirm={() => confirmPrompt && handlePurgePrompt(confirmPrompt)}
          title={`Очистить кэш для ${confirmPrompt}?`}
          confirmLabel="Очистить"
          destructive
          loading={purge.isPending}
        />
      </div>
    </Page>
  );
}

export default LLMCacheAdminPage;
