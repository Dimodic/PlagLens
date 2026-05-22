/**
 * /assignments/:assignmentId/plagiarism — runs list for an assignment.
 */
import { Loader2, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { EmptyState } from '@/components/common/EmptyState';
import { RunStatusBadge } from '@/components/plagiarism/RunStatusBadge';
import { SimilarityBar } from '@/components/plagiarism/SimilarityBar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDeleteRun,
  usePlagiarismRuns,
  useRunPlagiarism,
} from '@/hooks/api/usePlagiarism';
import type { PlagiarismProvider as ProviderName } from '@/api/endpoints/plagiarism';
import type { Problem } from '@/api/types';

const PROVIDERS: Array<{ value: ProviderName; label: string }> = [
  { value: 'dolos', label: 'Dolos' },
];

function fmt(date: string | null): string {
  if (!date) return '—';
  return dayjs(date).format('DD.MM.YYYY HH:mm');
}

interface RunModalProps {
  assignmentId: string;
  opened: boolean;
  onClose: () => void;
}

function StartRunModal({ assignmentId, opened, onClose }: RunModalProps) {
  const [provider, setProvider] = useState<ProviderName>('dolos');
  const [withCorpus, setWithCorpus] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [includeVersions, setIncludeVersions] = useState<
    'selected' | 'all_versions' | 'latest_per_student'
  >('selected');
  const notify = useNotifications();
  const mutation = useRunPlagiarism(assignmentId);

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync({
        provider,
        with_corpus: withCorpus,
        options: {
          similarity_threshold: threshold,
          include_versions: includeVersions,
        },
      });
      notify.success('Проверка поставлена в очередь');
      onClose();
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось запустить проверку');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="plagiarism-run-create-modal" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Запустить новую проверку</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Провайдер</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as ProviderName)}
            >
              <SelectTrigger data-testid="plagiarism-run-create-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={withCorpus}
              onCheckedChange={(c) => setWithCorpus(!!c)}
              data-testid="plagiarism-run-create-with-corpus"
            />
            <span className="text-sm">Включить cross-course корпус</span>
          </label>

          <div className="space-y-1">
            <Label className="text-sm">
              Threshold подозрительности:{' '}
              <span className="text-primary">{threshold.toFixed(2)}</span>
            </Label>
            <Slider
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0] ?? threshold)}
              min={0.1}
              max={0.95}
              step={0.05}
            />
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>0.4</span>
              <span>0.7</span>
              <span>0.9</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Какие версии посылок брать</Label>
            <Select
              value={includeVersions}
              onValueChange={(v) => v && setIncludeVersions(v as typeof includeVersions)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="selected">Выбранные преподавателем</SelectItem>
                <SelectItem value="all_versions">Все версии</SelectItem>
                <SelectItem value="latest_per_student">Только последние</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="plagiarism-run-create-cancel"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="plagiarism-run-create-submit"
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Запустить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlagiarismRunsListPage() {
  const { assignmentId = '' } = useParams<{ assignmentId: string }>();
  useDocumentTitle('Проверки на плагиат');
  const [opened, setOpened] = useState(false);
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const notify = useNotifications();
  const deleteRunMut = useDeleteRun(runToDelete ?? '');
  const { data, isLoading, error } = usePlagiarismRuns(assignmentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        title="Проверки на плагиат"
        action={
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked disabled />
              <span>Auto-refresh</span>
            </label>
            <Button
              onClick={() => setOpened(true)}
              data-testid="plagiarism-run-create-open"
            >
              Запустить новую проверку
            </Button>
          </>
        }
      />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="Проверок не было"
          action={
            <Button onClick={() => setOpened(true)}>Запустить</Button>
          }
        />
      )}

      {data && data.data.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="plagiarism-runs-table" className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Запущено</TableHead>
                <TableHead>Завершено</TableHead>
                <TableHead>Провайдер</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Max similarity</TableHead>
                <TableHead>Подозр-ных пар</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={`plagiarism-run-row-${r.id}`}
                >
                  <TableCell>{fmt(r.started_at)}</TableCell>
                  <TableCell>{fmt(r.finished_at)}</TableCell>
                  <TableCell>{r.provider}</TableCell>
                  <TableCell>
                    <RunStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>{r.submissions_count}</TableCell>
                  <TableCell>
                    <SimilarityBar value={r.max_similarity} width={120} />
                  </TableCell>
                  <TableCell>{r.pairs_suspected}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/plagiarism-runs/${r.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Открыть
                      </Link>
                      <button
                        type="button"
                        onClick={() => setRunToDelete(r.id)}
                        aria-label="Удалить проверку"
                        data-testid={`plagiarism-run-row-${r.id}-delete`}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <StartRunModal
        assignmentId={assignmentId}
        opened={opened}
        onClose={() => setOpened(false)}
      />

      <ConfirmDialog
        opened={!!runToDelete}
        title="Удалить проверку?"
        message="Запуск пропадёт из списка. Историю pairs/clusters восстановить не получится."
        confirmLabel="Удалить"
        destructive
        loading={deleteRunMut.isPending}
        onConfirm={async () => {
          try {
            await deleteRunMut.mutateAsync();
            notify.success('Проверка удалена');
          } catch (e) {
            notify.error(
              (e as Problem)?.detail ??
                (e as Problem)?.title ??
                'Не удалось удалить проверку',
            );
          } finally {
            setRunToDelete(null);
          }
        }}
        onClose={() => setRunToDelete(null)}
      />
    </Page>
  );
}

export default PlagiarismRunsListPage;
