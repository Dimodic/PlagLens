/**
 * Per-tenant users manager — the «Пользователи» tab on a tenant's detail page.
 * A trimmed version of /admin/users (no role-filter tabs): search + create
 * (modal) + per-row action menu, all scoped to this tenant.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Loader2, Plus, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusPill } from '@/components/common/StatusPill';
import { RoleBadge } from '@/components/common/RoleBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { UserActionMenu } from '@/components/admin/UserActionMenu';
import { TenantUserCreateDialog } from '@/components/admin/TenantUserCreateDialog';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useAnonymizeUser,
  useDisableUser,
  useEnableUser,
  useForceLogout,
  useResetUserPassword,
  useSetUserRole,
  useUsers,
} from '@/hooks/api/useUsers';
import type { GlobalRole, Problem } from '@/api/types';
import type { UserDetail } from '@/api/endpoints/users';

function initials(name?: string | null): string {
  if (!name) return 'U';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function TenantUsersPanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotifications();

  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<UserDetail | null>(null);

  const filters = useMemo(
    () => ({ tenant_id: tenantId, q: q || undefined, limit: 100 }),
    [tenantId, q],
  );
  const { data, isPending, error, refetch } = useUsers(filters, { enabled: !!tenantId });
  const disable = useDisableUser();
  const enable = useEnableUser();
  const anonymize = useAnonymizeUser();
  const reset = useResetUserPassword();
  const forceLogout = useForceLogout();
  const setRole = useSetUserRole();

  const rows = data?.data ?? [];

  const run = async (fn: () => Promise<unknown>, okKey: string) => {
    try {
      await fn();
      notify.success(t(okKey));
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            placeholder={t('users_list.search_placeholder')}
            className="h-9 pl-9"
            data-testid="tenant-users-search"
          />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="tenant-users-create">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('common.create')}
        </Button>
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isPending && !data ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('tenant_detail.users_empty')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-y">
              <TableHead>{t('users_list.col_user')}</TableHead>
              <TableHead className="w-40">{t('users_list.col_role')}</TableHead>
              <TableHead className="w-28">{t('users_list.col_status')}</TableHead>
              <TableHead className="w-40">{t('users_list.col_last_login')}</TableHead>
              <TableHead className="w-12 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow
                key={u.id}
                data-testid={`tenant-user-row-${u.id}`}
                onClick={() => navigate(`/admin/users/${u.id}`)}
                className="cursor-pointer border-b-0 transition-colors hover:bg-muted/40"
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                        {initials(u.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {u.display_name || '—'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={u.global_role} />
                </TableCell>
                <TableCell>
                  {u.status === 'active' ? (
                    <StatusPill tone="success">{t('users_list.status_active')}</StatusPill>
                  ) : (
                    <StatusPill tone="destructive">{t('users_list.status_disabled')}</StatusPill>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {u.last_login_at ? dayjs(u.last_login_at).fromNow() : ''}
                  </span>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <UserActionMenu
                    user={u}
                    onView={(usr) => navigate(`/admin/users/${usr.id}`)}
                    onResetPassword={(usr) =>
                      run(() => reset.mutateAsync(usr.id), 'users_list.notify_reset_sent')
                    }
                    onForceLogout={(usr) =>
                      run(() => forceLogout.mutateAsync(usr.id), 'users_list.notify_sessions_ended')
                    }
                    onDisable={(usr) =>
                      run(() => disable.mutateAsync(usr.id), 'users_list.notify_disabled')
                    }
                    onEnable={(usr) =>
                      run(() => enable.mutateAsync(usr.id), 'users_list.notify_enabled')
                    }
                    onChangeRole={(usr, r: GlobalRole) =>
                      run(() => setRole.mutateAsync({ id: usr.id, role: r }), 'users_list.notify_role_changed')
                    }
                    onAnonymize={(usr) => setConfirm(usr)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TenantUserCreateDialog tenantId={tenantId} open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        opened={confirm != null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            run(() => anonymize.mutateAsync(confirm.id), 'users_list.notify_anonymized');
            setConfirm(null);
          }
        }}
        title={t('users_list.anonymize_title')}
        message={t('users_list.anonymize_message')}
        confirmLabel={t('users_list.anonymize_confirm')}
        destructive
      />
    </div>
  );
}

export default TenantUsersPanel;
