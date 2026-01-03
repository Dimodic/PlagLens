/**
 * CourseMembersPage — table + add/bulk-invite modal.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, UserPlus, Users } from 'lucide-react';
import {
  useAddMember,
  useBulkInvite,
  useCourse,
  useCourseMembers,
  useRemoveMember,
} from '@/hooks/api/useCourses';
import { MembersTable } from '@/components/courses/MembersTable';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { AsyncOperationStatus } from '@/components/common/AsyncOperationStatus';
import { Page, PageHeader } from '@/components/layout/Page';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import type { CourseMember } from '@/api/endpoints/courses';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CourseMembersPage() {
  useDocumentTitle('Участники курса');
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const notify = useNotifications();
  const { data: course } = useCourse(slug);
  const { data: members, isLoading } = useCourseMembers(course?.id);

  const addMember = useAddMember(course?.id ?? '');
  const bulkInvite = useBulkInvite(course?.id ?? '');
  const remove = useRemoveMember(course?.id ?? '');

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirm, setConfirm] = useState<CourseMember | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Form states for add/bulk
  const [addUserId, setAddUserId] = useState('');
  const [addUserIdError, setAddUserIdError] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<'student' | 'assistant'>('student');

  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkEmailsError, setBulkEmailsError] = useState<string | null>(null);
  const [bulkRole, setBulkRole] = useState<'student' | 'assistant'>('student');
  const [bulkMessage, setBulkMessage] = useState('');

  const canManage =
    course && user
      ? hasCourseRole(user, course.id, ['owner', 'co_owner']) ||
        hasGlobalRole(user, ['admin', 'super_admin'])
      : false;

  const resetAddForm = () => {
    setAddUserId('');
    setAddRole('student');
    setAddUserIdError(null);
  };
  const resetBulkForm = () => {
    setBulkEmails('');
    setBulkRole('student');
    setBulkMessage('');
    setBulkEmailsError(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId.trim()) {
      setAddUserIdError('Введите идентификатор пользователя');
      return;
    }
    setAddUserIdError(null);
    try {
      await addMember.mutateAsync({
        user_id: addUserId,
        role: addRole,
      });
      notify.success('Участник добавлен');
      setAddOpen(false);
      resetAddForm();
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emails = bulkEmails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setBulkEmailsError('Введите хотя бы один email');
      return;
    }
    setBulkEmailsError(null);
    try {
      const op = await bulkInvite.mutateAsync({
        emails,
        role: bulkRole,
        message: bulkMessage || undefined,
      });
      setOpId(op.id);
      notify.info(`Приглашаем ${emails.length} человек…`);
      setBulkOpen(false);
      resetBulkForm();
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    // Standard Page wrapper — same width as the rest of the course
    // sub-pages so the layout doesn't jump. Subtitle (course name) is
    // dropped because breadcrumbs already show "Курсы › <Course> ›
    // Участники" up top.
    <Page width="wide">
      <PageHeader
        title={<span data-testid="course-members-title">Участники курса</span>}
        action={
          canManage ? (
            <>
              <Button
                variant="outline"
                onClick={() => setAddOpen(true)}
                data-testid="course-members-add-button"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Добавить участника
              </Button>
              <Button
                onClick={() => setBulkOpen(true)}
                data-testid="course-members-bulk-button"
              >
                <Users className="mr-2 h-4 w-4" />
                Массовое приглашение
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="space-y-4">
        <ProblemAlert problem={problem} />
        {opId && (
          <AsyncOperationStatus operationId={opId} onComplete={() => setOpId(null)} />
        )}

        {!isLoading && (
          <MembersTable
            members={members?.data ?? []}
            canManage={canManage}
            onRemove={(m) => setConfirm(m)}
          />
        )}
      </div>

      {/* Add member dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false);
            resetAddForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить участника</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="course-members-add-user-id">ID пользователя</Label>
              <Input
                id="course-members-add-user-id"
                placeholder="usr_..."
                required
                data-testid="course-members-add-user-id"
                value={addUserId}
                onChange={(e) => setAddUserId(e.currentTarget.value)}
                aria-invalid={!!addUserIdError}
              />
              {addUserIdError && (
                <p className="text-sm text-destructive">{addUserIdError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-members-add-role">Роль</Label>
              <Select
                value={addRole}
                onValueChange={(v) => setAddRole(v as 'student' | 'assistant')}
              >
                <SelectTrigger
                  id="course-members-add-role"
                  data-testid="course-members-add-role"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Студент</SelectItem>
                  <SelectItem value="assistant">Ассистент</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAddOpen(false);
                  resetAddForm();
                }}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={addMember.isPending}
                data-testid="course-members-add-submit"
              >
                {addMember.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk invite dialog */}
      <Dialog
        open={bulkOpen}
        onOpenChange={(o) => {
          if (!o) {
            setBulkOpen(false);
            resetBulkForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Массовое приглашение</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="course-members-bulk-emails">Email-адреса</Label>
              <Textarea
                id="course-members-bulk-emails"
                rows={5}
                data-testid="course-members-bulk-emails"
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.currentTarget.value)}
                aria-invalid={!!bulkEmailsError}
              />
              <p className="text-xs text-muted-foreground">
                По одному в строке или через запятую
              </p>
              {bulkEmailsError && (
                <p className="text-sm text-destructive">{bulkEmailsError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-members-bulk-role">Роль для приглашённых</Label>
              <Select
                value={bulkRole}
                onValueChange={(v) => setBulkRole(v as 'student' | 'assistant')}
              >
                <SelectTrigger
                  id="course-members-bulk-role"
                  data-testid="course-members-bulk-role"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Студент</SelectItem>
                  <SelectItem value="assistant">Ассистент</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-members-bulk-message">
                Сообщение (опционально)
              </Label>
              <Textarea
                id="course-members-bulk-message"
                rows={3}
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.currentTarget.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBulkOpen(false);
                  resetBulkForm();
                }}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={bulkInvite.isPending}
                data-testid="course-members-bulk-submit"
              >
                {bulkInvite.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Отправить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        opened={!!confirm}
        title="Удалить участника?"
        message={
          confirm
            ? `Пользователь ${confirm.user?.display_name ?? confirm.user_id} будет удалён из курса.`
            : ''
        }
        destructive
        confirmLabel="Удалить"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await remove.mutateAsync(confirm.user_id);
            notify.success('Участник удалён');
          } catch (err) {
            setProblem(parseProblem(err));
          }
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </Page>
  );
}
