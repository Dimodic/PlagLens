/**
 * CourseInvitationsPage — list invitation codes; create new; copy link.
 */
import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useCourse,
  useCreateInvitation,
  useDeleteInvitation,
  useInvitations,
} from '@/hooks/api/useCourses';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { formatDate, formatDateTime } from '@/utils/formatters';
import type { Problem } from '@/api/types';
import type { Invitation } from '@/api/endpoints/courses';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CopyButtonProps {
  value: string;
  testId?: string;
}

function CopyLinkButton({ value, testId }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors — best-effort UX.
    }
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCopy}
            data-testid={testId}
            aria-label={copied ? 'Скопировано' : 'Копировать ссылку'}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? 'Скопировано' : 'Копировать ссылку'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface FormVals {
  role: 'student' | 'assistant';
  email: string;
  max_uses: number | null;
  expires_at: string;
}

const INITIAL_FORM: FormVals = {
  role: 'student',
  email: '',
  max_uses: 25,
  expires_at: '',
};

export default function CourseInvitationsPage() {
  useDocumentTitle('Приглашения');
  const { slug } = useParams<{ slug: string }>();
  const notify = useNotifications();
  const { data: course } = useCourse(slug);
  const { data: invitations, isLoading } = useInvitations(course?.id);
  const create = useCreateInvitation(course?.id ?? '');
  const remove = useDeleteInvitation(course?.id ?? '');

  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [form, setForm] = useState<FormVals>(INITIAL_FORM);

  const link = (inv: Invitation): string =>
    `${window.location.origin}/courses/join/${encodeURIComponent(inv.code)}`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({
        role: form.role,
        email: form.email || null,
        max_uses: form.max_uses ?? null,
        expires_at: form.expires_at
          ? new Date(form.expires_at).toISOString()
          : null,
      });
      notify.success('Приглашение создано');
      setOpen(false);
      setForm(INITIAL_FORM);
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  return (
    <Page width="wide">
      <PageHeader
        title={
          <span data-testid="course-invitations-title">Приглашения</span>
        }
        action={
          <Button
            onClick={() => setOpen(true)}
            data-testid="course-invitations-create-button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Создать приглашение
          </Button>
        }
      />

      <ProblemAlert problem={problem} />

      {!isLoading && (invitations?.data.length ?? 0) === 0 ? (
        <EmptyState
          title="Нет активных приглашений"
          message="Создайте код приглашения, чтобы поделиться им со студентами."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Код</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Использовано</TableHead>
                <TableHead>Истекает</TableHead>
                <TableHead>Создано</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations?.data.map((inv) => (
                <TableRow key={inv.id} data-testid={`invitation-${inv.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-sm"
                        data-testid={`invitation-code-${inv.id}`}
                      >
                        {inv.code}
                      </span>
                      <CopyLinkButton
                        value={link(inv)}
                        testId={`invitation-copy-${inv.id}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {inv.role === 'assistant' ? (
                      <Badge className="font-normal bg-accent text-accent-foreground hover:bg-accent">
                        Ассистент
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal">
                        Студент
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {inv.used_count}{' '}
                      {inv.max_uses ? `/ ${inv.max_uses}` : ''}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {inv.expires_at ? formatDateTime(inv.expires_at) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(inv.created_at)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Отозвать"
                      data-testid={`invitation-delete-${inv.id}`}
                      onClick={async () => {
                        try {
                          await remove.mutateAsync(inv.id);
                          notify.success('Приглашение отозвано');
                        } catch (e) {
                          setProblem(parseProblem(e));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новое приглашение</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Роль</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    role: v as FormVals['role'],
                  }))
                }
              >
                <SelectTrigger data-testid="course-invitations-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Студент</SelectItem>
                  <SelectItem value="assistant">Ассистент</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invitation-email">
                Email (опционально, для одноразового приглашения)
              </Label>
              <Input
                id="invitation-email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                data-testid="course-invitations-email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invitation-max-uses">
                Максимум использований
              </Label>
              <Input
                id="invitation-max-uses"
                type="number"
                min={1}
                max={1000}
                value={form.max_uses ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_uses: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
                data-testid="course-invitations-max-uses"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invitation-expires">Истекает</Label>
              <Input
                id="invitation-expires"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expires_at: e.target.value }))
                }
                data-testid="course-invitations-expires"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="course-invitations-submit"
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
    </Page>
  );
}
