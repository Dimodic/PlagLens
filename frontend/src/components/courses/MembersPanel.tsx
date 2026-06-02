/**
 * MembersPanel — inline-tab panel for the «Участники» tab on the course page.
 *
 * Flat document-style rows (same rhythm as the homeworks list). The four ways
 * to add people now live behind a SINGLE «Добавить» button that opens
 * `AddMembersDialog` (method tabs inside) — replaces the old four-item dropdown
 * that opened four separate dialogs and confused teachers.
 */
import { useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, UserPlus } from 'lucide-react';
import {
  useChangeMemberRole,
  useCourseMembers,
  useRemoveMember,
} from '@/hooks/api/useCourses';
import { useUsers } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import { parseProblem } from '@/api/problem';
import { cn } from '@/components/ui/utils';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { AsyncOperationStatus } from '@/components/common/AsyncOperationStatus';
import { EmptyState } from '@/components/common/EmptyState';
import { RoleBadge } from '@/components/common/RoleBadge';
import { ExpandableSearch } from '@/components/common/ExpandableSearch';
import { AddMembersDialog } from '@/components/courses/AddMembersDialog';
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
import { formatDate } from '@/utils/formatters';

interface MembersPanelProps {
  courseId: string;
  canManage: boolean;
}

type RoleFilter = 'all' | 'staff' | 'student';

export function MembersPanel({ courseId, canManage }: MembersPanelProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const { data: members, isLoading } = useCourseMembers(courseId);
  // Only staff can list users; gate via `enabled` so a student-side page that
  // imports this hook doesn't 403. canManage is the staff signal here.
  const { data: usersPage } = useUsers({ limit: 200 }, { enabled: canManage });

  const remove = useRemoveMember(courseId);
  const changeRole = useChangeMemberRole(courseId);

  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<CourseMember | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Resolve `user_id` → display name once, then inject the synthetic `user`
  // object so the row renders a real name instead of "usr_8598df…".
  const enrichedMembers: CourseMember[] = useMemo(() => {
    const byId = new Map((usersPage?.data ?? []).map((u) => [u.id, u]));
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

  // Promote/demote an existing member between student and assistant.
  const handleSetRole = async (m: CourseMember, role: 'student' | 'assistant') => {
    try {
      await changeRole.mutateAsync({ user_id: m.user_id, role });
      notify.success(t('members_panel.role_changed'));
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <div className="space-y-4" data-testid="members-panel">
      {/* Controls strip: search + role filter on the left, one add action right. */}
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
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              data-testid="course-members-add-menu"
            >
              <UserPlus className="mr-2 h-3.5 w-3.5" />
              {t('members_panel.add')}
            </Button>
          </div>
        )}
      </div>

      <ProblemAlert problem={problem} />
      {opId && (
        <AsyncOperationStatus operationId={opId} onComplete={() => setOpId(null)} />
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
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="text-xs">
                    {displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {displayName}
                  </div>
                  {email && (
                    <div className="text-xs text-muted-foreground truncate">{email}</div>
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

      <AddMembersDialog
        courseId={courseId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onOperation={setOpId}
      />

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

/** Filter chips — inline, no Select chrome. */
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
    <div className="flex items-center gap-2" data-testid="course-members-role-filter">
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
