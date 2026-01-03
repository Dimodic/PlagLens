/**
 * AssignmentDeadlinesPage — per-user deadline extensions.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAssignment,
  useCreateDeadlineExtension,
  useDeadlineExtensions,
  useDeleteDeadlineExtension,
} from '@/hooks/api/useAssignments';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { formatDateTime } from '@/utils/formatters';
import type { Problem } from '@/api/types';
import type { DeadlineExtension } from '@/api/endpoints/assignments';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AssignmentDeadlinesPage() {
  useDocumentTitle('Продления дедлайна');
  const { id } = useParams<{ id: string }>();
  const notify = useNotifications();
  const { data: assignment } = useAssignment(id);
  const { data: extensions, isLoading } = useDeadlineExtensions(id);
  const create = useCreateDeadlineExtension(id ?? '');
  const remove = useDeleteDeadlineExtension(id ?? '');

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<DeadlineExtension | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const [userId, setUserId] = useState('');
  const [softAt, setSoftAt] = useState<string | null>(null);
  const [hardAt, setHardAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [userIdError, setUserIdError] = useState<string | null>(null);

  const resetForm = () => {
    setUserId('');
    setSoftAt(null);
    setHardAt(null);
    setReason('');
    setUserIdError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setUserIdError('Введите ID пользователя');
      return;
    }
    setUserIdError(null);
    try {
      await create.mutateAsync({
        user_id: userId,
        deadline_soft_at: softAt,
        deadline_hard_at: hardAt,
        reason: reason || undefined,
      });
      notify.success('Продление создано');
      setOpen(false);
      resetForm();
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Продления дедлайна
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {assignment?.title ?? '—'}
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          data-testid="deadline-extension-add"
        >
          <Plus className="mr-2 h-4 w-4" />
          Продлить дедлайн
        </Button>
      </div>

      <ProblemAlert problem={problem} />

      {isLoading ? null : (extensions?.data.length ?? 0) === 0 ? (
        <EmptyState
          title="Нет продлений"
          message="Здесь появятся индивидуальные продления дедлайна студентам."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Студент</TableHead>
                <TableHead>Soft</TableHead>
                <TableHead>Hard</TableHead>
                <TableHead>Причина</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {extensions?.data.map((ext) => (
                <TableRow key={ext.id} data-testid={`ext-${ext.id}`}>
                  <TableCell>
                    <span className="text-sm">
                      {ext.user_display_name ?? ext.user_id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {ext.deadline_soft_at
                        ? formatDateTime(ext.deadline_soft_at)
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {ext.deadline_hard_at
                        ? formatDateTime(ext.deadline_hard_at)
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {ext.reason ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirm(ext)}
                      aria-label="Отменить"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Продлить дедлайн</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="deadline-extension-user_id-input">
                ID пользователя *
              </Label>
              <Input
                id="deadline-extension-user_id-input"
                data-testid="deadline-extension-user_id"
                value={userId}
                onChange={(e) => setUserId(e.currentTarget.value)}
                aria-invalid={!!userIdError}
              />
              {userIdError && (
                <p className="text-sm text-destructive">{userIdError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline-extension-soft_at-input">
                Новый soft-дедлайн
              </Label>
              <Input
                id="deadline-extension-soft_at-input"
                type="datetime-local"
                data-testid="deadline-extension-soft_at"
                value={toLocalInput(softAt)}
                onChange={(e) => setSoftAt(fromLocalInput(e.currentTarget.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline-extension-hard_at-input">
                Новый hard-дедлайн
              </Label>
              <Input
                id="deadline-extension-hard_at-input"
                type="datetime-local"
                data-testid="deadline-extension-hard_at"
                value={toLocalInput(hardAt)}
                onChange={(e) => setHardAt(fromLocalInput(e.currentTarget.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline-extension-reason-input">Причина</Label>
              <Textarea
                id="deadline-extension-reason-input"
                rows={2}
                data-testid="deadline-extension-reason"
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                data-testid="deadline-extension-cancel"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="deadline-extension-submit"
              >
                {create.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        opened={!!confirm}
        title="Отменить продление?"
        destructive
        confirmLabel="Отменить"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await remove.mutateAsync(confirm.id);
            notify.success('Продление отменено');
          } catch (err) {
            setProblem(parseProblem(err));
          }
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
