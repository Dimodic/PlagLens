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
import { useMutation } from '@tanstack/react-query';
import {
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Ticket,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  useAddMember,
  useBulkInvite,
  useChangeMemberRole,
  useCourseMembers,
  useRemoveMember,
} from '@/hooks/api/useCourses';
import { invitationsApi } from '@/api/endpoints/invitations';
import type { BulkBindingItem } from '@/api/endpoints/invitations';
import { useBulkBindings } from '@/hooks/api/useInvitations';
import { useExternalParticipants } from '@/hooks/api/useSubmissions';
import { useUsers } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { t, useTranslation } from '@/i18n';
import { parseProblem } from '@/api/problem';
import { cn } from '@/components/ui/utils';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { AsyncOperationStatus } from '@/components/common/AsyncOperationStatus';
import { EmptyState } from '@/components/common/EmptyState';
import { RoleBadge } from '@/components/common/RoleBadge';
import { ExpandableSearch } from '@/components/common/ExpandableSearch';
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


type RoleFilter = 'all' | 'staff' | 'student';

/** Build a `ФИО,Код` CSV from the minted codes and trigger a download.
 *  No new deps — just a Blob + a transient object URL. Values are quoted
 *  so a comma in a ФИО can't shift columns. */
function downloadCodesCsv(items: BulkBindingItem[]): void {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    t('members_panel.csv_header'),
    ...items.map((it) => `${esc(it.display_name ?? it.external_id)},${esc(it.code)}`),
  ];
  // Prepend a BOM so Excel reads the Cyrillic as UTF-8.
  const blob = new Blob(['﻿' + rows.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yandex-contest-codes.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MembersPanel({ courseId, canManage }: MembersPanelProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const { data: members, isLoading } = useCourseMembers(courseId);
  // Only staff can list users; gate via the `enabled` opt so a
  // student-side page importing this hook doesn't 403. canManage is
  // the staff signal here (owner/co_owner/admin).
  const { data: usersPage } = useUsers({ limit: 200 }, { enabled: canManage });

  const addMember = useAddMember(courseId);
  const bulkInvite = useBulkInvite(courseId);
  const remove = useRemoveMember(courseId);
  const changeRole = useChangeMemberRole(courseId);

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

  // ---- Invite-by-code: a course-attached identity invitation. The
  // teacher shares the short code; the joiner enters it in «Активировать
  // код» (profile) and lands in THIS course (redeem attaches them).
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeRole, setCodeRole] = useState<'student' | 'assistant'>('student');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const createCode = useMutation({
    mutationFn: () =>
      invitationsApi.create({ role: codeRole, course_id: courseId }),
    onSuccess: (inv) => setGeneratedCode(inv.code ?? null),
    onError: (e) =>
      notify.error(parseProblem(e).detail || t('members_panel.code_create_error')),
  });

  // ---- Я.Контест codes: one claim code per imported participant. The
  // teacher mints all codes at once and hands them out; the student
  // enters theirs in «Активировать код» and their contest submissions
  // attach to their account. Participants are fetched lazily on open.
  const [ycOpen, setYcOpen] = useState(false);
  const participants = useExternalParticipants(courseId, { enabled: ycOpen });
  const bulkBindings = useBulkBindings();
  const ycItems = bulkBindings.data?.items ?? null;
  const generateYcCodes = () => {
    const list = participants.data ?? [];
    if (list.length === 0) return;
    bulkBindings.mutate(
      {
        course_id: courseId,
        participants: list.map((p) => ({
          external_id: p.external_id,
          display_name: p.display_name,
        })),
      },
      {
        onError: (e) =>
          notify.error(parseProblem(e).detail || t('members_panel.codes_create_error')),
      },
    );
  };

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
      setAddUserIdError(t('members_panel.add_user_id_required'));
      return;
    }
    setAddUserIdError(null);
    try {
      await addMember.mutateAsync({ user_id: addUserId, role: addRole });
      notify.success(t('members_panel.member_added'));
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
      setBulkEmailsError(t('members_panel.bulk_emails_required'));
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
      notify.info(t('members_panel.inviting_count', { count: emails.length }));
      setBulkOpen(false);
      resetBulkForm();
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  // Promote/demote an existing member between student and assistant. The
  // distribute («Распределить между ассистентами») pool keys off the *course*
  // role, so this is how a student becomes a grader for THIS course — adding
  // them via the dialog 409s ("already a member") and the global role doesn't
  // affect the per-course grader pool.
  const handleSetRole = async (
    m: CourseMember,
    role: 'student' | 'assistant',
  ) => {
    try {
      await changeRole.mutateAsync({ user_id: m.user_id, role });
      notify.success(t('members_panel.role_changed'));
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
        <ExpandableSearch
          value={query}
          onChange={setQuery}
          placeholder={t('members_panel.search_placeholder')}
          data-testid="course-members-search"
        />
        <FilterChips
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: 'all', label: t('members_panel.filter_all') },
            { value: 'staff', label: t('members_panel.filter_staff') },
            { value: 'student', label: t('members_panel.filter_student') },
          ]}
        />
        {canManage && (
          <div className="ml-auto">
            {/* One primary action with a menu of the four ways to add people —
                keeps the toolbar light (was four side-by-side buttons). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="course-members-add-menu">
                  <UserPlus className="mr-2 h-3.5 w-3.5" />
                  {t('members_panel.add')}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={() => setAddOpen(true)}
                  data-testid="course-members-add-button"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t('members_panel.add_manual')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setBulkOpen(true)}
                  data-testid="course-members-bulk-button"
                >
                  <Users className="mr-2 h-4 w-4" />
                  {t('members_panel.invite_list')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setGeneratedCode(null);
                    setCodeOpen(true);
                  }}
                  data-testid="course-members-code-button"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  {t('members_panel.invite_code')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    bulkBindings.reset();
                    setYcOpen(true);
                  }}
                  data-testid="course-members-yc-button"
                >
                  <Ticket className="mr-2 h-4 w-4" />
                  {t('members_panel.yc_codes')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              ? t('members_panel.empty')
              : t('members_panel.empty_filtered')
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
                <div className="flex w-24 flex-none justify-end">
                  <RoleBadge role={m.role} />
                </div>
                <span className="hidden md:inline flex-none text-xs tabular-nums text-muted-foreground w-24 text-right">
                  {formatDate(m.joined_at)}
                </span>
                {canManage && m.role !== 'owner' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('members_panel.actions')}
                        className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded opacity-60 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.role === 'student' && (
                        <DropdownMenuItem
                          onClick={() => handleSetRole(m, 'assistant')}
                          data-testid={`member-make-assistant-${m.user_id}`}
                        >
                          {t('members_panel.make_assistant')}
                        </DropdownMenuItem>
                      )}
                      {m.role === 'assistant' && (
                        <DropdownMenuItem
                          onClick={() => handleSetRole(m, 'student')}
                          data-testid={`member-make-student-${m.user_id}`}
                        >
                          {t('members_panel.make_student')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setConfirm(m)}
                        className="text-destructive focus:text-destructive"
                      >
                        {t('members_panel.remove_from_course')}
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
            <DialogTitle>{t('members_panel.add_dialog_title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="course-members-add-user-id">{t('members_panel.user_id_label')}</Label>
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
              <Label htmlFor="course-members-add-role">{t('members_panel.role_label')}</Label>
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
                  <SelectItem value="student">{t('members_panel.role_student')}</SelectItem>
                  <SelectItem value="assistant">{t('members_panel.role_assistant')}</SelectItem>
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
                {t('members_panel.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={addMember.isPending}
                data-testid="course-members-add-submit"
              >
                {addMember.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('members_panel.add')}
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
            <DialogTitle>{t('members_panel.bulk_dialog_title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="course-members-bulk-emails">{t('members_panel.emails_label')}</Label>
              <Textarea
                id="course-members-bulk-emails"
                rows={5}
                data-testid="course-members-bulk-emails"
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.currentTarget.value)}
                aria-invalid={!!bulkEmailsError}
              />
              <p className="text-xs text-muted-foreground">
                {t('members_panel.emails_hint')}
              </p>
              {bulkEmailsError && (
                <p className="text-sm text-destructive">{bulkEmailsError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-members-bulk-role">
                {t('members_panel.bulk_role_label')}
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
                  <SelectItem value="student">{t('members_panel.role_student')}</SelectItem>
                  <SelectItem value="assistant">{t('members_panel.role_assistant')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-members-bulk-message">
                {t('members_panel.message_label')}
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
                {t('members_panel.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={bulkInvite.isPending}
                data-testid="course-members-bulk-submit"
              >
                {bulkInvite.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('members_panel.send')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite-by-code dialog — generates a course-attached code the
          teacher shares; the joiner enters it in «Активировать код». */}
      <Dialog
        open={codeOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCodeOpen(false);
            setGeneratedCode(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('members_panel.code_dialog_title')}</DialogTitle>
          </DialogHeader>
          {generatedCode ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('members_panel.code_share_hint')}
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-lg font-semibold tracking-wider"
                  data-testid="course-members-code-value"
                >
                  {generatedCode}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title={t('members_panel.copy')}
                  onClick={() => {
                    void navigator.clipboard?.writeText(generatedCode);
                    notify.info(t('members_panel.copied'));
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setGeneratedCode(null)}
                >
                  {t('members_panel.create_more')}
                </Button>
                <Button type="button" onClick={() => setCodeOpen(false)}>
                  {t('members_panel.done')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="course-members-code-role">{t('members_panel.role_label')}</Label>
                <Select
                  value={codeRole}
                  onValueChange={(v) =>
                    setCodeRole(v as 'student' | 'assistant')
                  }
                >
                  <SelectTrigger
                    id="course-members-code-role"
                    data-testid="course-members-code-role"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">{t('members_panel.role_student')}</SelectItem>
                    <SelectItem value="assistant">{t('members_panel.role_assistant')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('members_panel.code_one_time_hint')}
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCodeOpen(false)}
                >
                  {t('members_panel.cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={() => createCode.mutate()}
                  disabled={createCode.isPending}
                  data-testid="course-members-code-create"
                >
                  {createCode.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('members_panel.code_create')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Я.Контест claim codes — mint one code per imported participant
          and hand them out; students redeem in «Активировать код». */}
      <Dialog
        open={ycOpen}
        onOpenChange={(o) => {
          if (!o) {
            setYcOpen(false);
            bulkBindings.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('members_panel.yc_dialog_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t('members_panel.yc_instructions')}
          </p>

          {participants.isLoading ? (
            <div className="flex items-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : participants.isError ? (
            <ProblemAlert problem={parseProblem(participants.error)} />
          ) : ycItems ? (
            // ---- Result: ФИО → code rows + copy-all / CSV ----
            <div className="space-y-3" data-testid="course-members-yc-result">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {t('members_panel.yc_ready_count', { count: ycItems.length })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const blob = ycItems
                        .map((it) => `${it.display_name ?? it.external_id}\t${it.code}`)
                        .join('\n');
                      void navigator.clipboard?.writeText(blob);
                      notify.info(t('members_panel.copied'));
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    {t('members_panel.copy_all')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadCodesCsv(ycItems)}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    {t('members_panel.download_csv')}
                  </Button>
                </div>
              </div>
              <div className="flex max-h-[50vh] flex-col divide-y divide-border/60 overflow-y-auto">
                {ycItems.map((it) => (
                  <div
                    key={it.external_id}
                    className="flex items-center gap-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {it.display_name ?? it.external_id}
                    </span>
                    <code className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-sm tracking-wider">
                      {it.code}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-none"
                      title={t('members_panel.copy')}
                      onClick={() => {
                        void navigator.clipboard?.writeText(it.code);
                        notify.info(t('members_panel.copied'));
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setYcOpen(false)}>
                  {t('members_panel.done')}
                </Button>
              </DialogFooter>
            </div>
          ) : (participants.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('members_panel.yc_empty')} />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                {t('members_panel.yc_unbound_count', { count: participants.data?.length ?? 0 })}
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setYcOpen(false)}
                >
                  {t('members_panel.cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={generateYcCodes}
                  disabled={bulkBindings.isPending}
                  data-testid="course-members-yc-create"
                >
                  {bulkBindings.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('members_panel.yc_create')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        opened={!!confirm}
        title={t('members_panel.remove_confirm_title')}
        message={
          confirm
            ? t('members_panel.remove_confirm_message', {
                name: confirm.user?.display_name ?? confirm.user_id,
              })
            : ''
        }
        destructive
        confirmLabel={t('members_panel.remove')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await remove.mutateAsync(confirm.user_id);
            notify.success(t('members_panel.member_removed'));
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
