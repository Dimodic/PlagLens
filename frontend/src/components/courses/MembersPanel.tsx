/**
 * MembersPanel — inline-tab panel for the «Участники» tab on the
 * course page.
 *
 * Earlier this rendered a heavy `<Table>` (avatar + 4 columns + actions
 * cell) which the user flagged as "не по дизайн коду". This rewrite
 * drops `MembersTable` entirely and emits flat document-style rows —
 * same rhythm as the homeworks list on the same page. The Add /
 * Bulk-invite flows and the resolve-usr-id-to-display-name trick (the
 * backend's `MemberRead` only carries `user_id` + `role`) stay.
 */
import { useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, UserPlus, Users } from 'lucide-react';
import {
  useAddMember,
  useBulkInvite,
  useCourseMembers,
  useRemoveMember,
} from '@/hooks/api/useCourses';
import { useUsers } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { cn } from '@/components/ui/utils';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { AsyncOperationStatus } from '@/components/common/AsyncOperationStatus';
import { EmptyState } from '@/components/common/EmptyState';
import type { Problem } from '@/api/types';
import type { CourseMember } from '@/api/endpoints/courses';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { formatDate } from '@/utils/formatters';

interface MembersPanelProps {
  courseId: string;
  canManage: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'владелец',
  co_owner: 'совладелец',
  assistant: 'ассистент',
  student: 'студент',
};

// Role tone — colours the role label same way as severity. Owner is
// emphasised, co-owner/assistant get a subtle accent, student stays
// muted (it's the default — no need to attract eyes).
const ROLE_TONE: Record<string, string> = {
  owner: 'text-primary',
  co_owner: 'text-primary/80',
  assistant: 'text-primary/80',
  student: 'text-muted-foreground',
};

type RoleFilter = 'all' | 'staff' | 'student';

export function MembersPanel({ courseId, canManage }: MembersPanelProps) {
  const notify = useNotifications();
  const { data: members, isLoading } = useCourseMembers(courseId);
  // Only staff can list users; gate via the `enabled` opt so a
  // student-side page importing this hook doesn't 403. canManage is
  // the staff signal here (owner/co_owner/admin).
  const { data: usersPage } = useUsers({ limit: 200 }, { enabled: canManage });

  const addMember = useAddMember(courseId);
  const bulkInvite = useBulkInvite(courseId);
  const remove = useRemoveMember(courseId);

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirm, setConfirm] = useState<CourseMember | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const [addUserId, setAddUserId] = useState('');
  const [addUserIdError, setAddUserIdError] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<'student' | 'assistant'>('student');

  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkEmailsError, setBulkEmailsError] = useState<string | null>(null);
  const [bulkRole, setBulkRole] = useState<'student' | 'assistant'>('student');
  const [bulkMessage, setBulkMessage] = useState('');

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Resolve `user_id` → display name once, then inject the synthetic
  // `user` object so the row renders a real name instead of "usr_8598df…".
  const enrichedMembers: CourseMember[] = useMemo(() => {
    const byId = new Map(
      (usersPage?.data ?? []).map((u) => [u.id, u]),
    );
    return (members?.data ?? []).map((m) => {
      const u = byId.get(m.user_id);
      if (!u) return m;
      return {
        ...m,
        user: {
          id: u.id,
          display_name: u.display_name ?? u.id,
          email: u.email ?? null,
          avatar_url: null,
        },
      } as CourseMember;
    });
  }, [members?.data, usersPage?.data]);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enrichedMembers.filter((m) => {
      if (roleFilter === 'staff' && m.role === 'student') return false;
      if (roleFilter === 'student' && m.role !== 'student') return false;
      if (!q) return true;
      const name = (m.user?.display_name ?? '').toLowerCase();
      const email = (m.user?.email ?? '').toLowerCase();
      const uid = m.user_id.toLowerCase();
      return name.includes(q) || email.includes(q) || uid.includes(q);
    });
  }, [enrichedMembers, query, roleFilter]);

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
      await addMember.mutateAsync({ user_id: addUserId, role: addRole });
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
    <div className="space-y-4" data-testid="members-panel">
      {/* ----- Controls strip: search + role filter on the left, the two
              management actions on the right. No header rule, just a
              normal flex row that sits above the list. ----- */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Поиск по имени / email / id"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className="h-9 max-w-sm flex-1"
          data-testid="course-members-search"
        />
        <FilterChips
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: 'all', label: 'все' },
            { value: 'staff', label: 'преподаватели' },
            { value: 'student', label: 'студенты' },
          ]}
        />
        {canManage && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
              data-testid="course-members-add-button"
            >
              <UserPlus className="mr-2 h-3.5 w-3.5" />
              Добавить
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkOpen(true)}
              data-testid="course-members-bulk-button"
            >
              <Users className="mr-2 h-3.5 w-3.5" />
              Пригласить
            </Button>
          </div>
        )}
      </div>

      <ProblemAlert problem={problem} />
      {opId && (
        <AsyncOperationStatus
          operationId={opId}
          onComplete={() => setOpId(null)}
        />
      )}

      {isLoading ? (
        <div className="flex items-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : visibleMembers.length === 0 ? (
        <EmptyState
          title={
            enrichedMembers.length === 0
              ? 'Нет участников'
              : 'Никто не подходит под фильтр'
          }
        />
      ) : (
        <div
          className="flex flex-col divide-y divide-border/60"
          data-testid="course-members-list"
        >
          {visibleMembers.map((m) => {
            const displayName = m.user?.display_name ?? m.user_id;
            const email = m.user?.email ?? null;
            const avatarUrl = m.user?.avatar_url;
            return (
              <div
                key={m.id}
                data-testid={`member-row-${m.user_id}`}
                className="group flex items-center gap-3 py-3"
              >
                <Avatar className="h-8 w-8 flex-none">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="text-xs">
                    {displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {displayName}
                  </div>
                  {email && (
                    <div className="text-xs text-muted-foreground truncate">
                      {email}
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    'flex-none text-xs uppercase tracking-wider w-24 text-right',
                    ROLE_TONE[m.role] ?? 'text-muted-foreground',
                  )}
                >
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
                <span className="hidden md:inline flex-none text-xs tabular-nums text-muted-foreground w-24 text-right">
                  {formatDate(m.joined_at)}
                </span>
                {canManage && m.role !== 'owner' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Действия"
                        className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded opacity-60 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setConfirm(m)}
                        className="text-destructive focus:text-destructive"
                      >
                        Удалить из курса
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>
      )}

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
                onValueChange={(v) =>
                  setAddRole(v as 'student' | 'assistant')
                }
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
              <Label htmlFor="course-members-bulk-role">
                Роль для приглашённых
              </Label>
              <Select
                value={bulkRole}
                onValueChange={(v) =>
                  setBulkRole(v as 'student' | 'assistant')
                }
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
    </div>
  );
}

/** Filter chips — same widget as SuspiciousPanel but scoped to the
 *  three role buckets we expose. Inline, no Select chrome. */
function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      className="flex items-center gap-2"
      data-testid="course-members-role-filter"
    >
      {options.map((opt, i) => (
        <span key={opt.value} className="contents">
          {i > 0 && (
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'text-sm transition-colors',
              value === opt.value
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        </span>
      ))}
    </div>
  );
}

export default MembersPanel;
