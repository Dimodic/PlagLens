/**
 * /admin/users — admin users list with role filter, search and bulk actions.
 *
 * Layout: a single card with an inline filter bar (tabs + search) on top and
 * the user table below. Tab counters come from a SEPARATE query that has no
 * role filter applied — otherwise switching the tab dropped the other tabs'
 * counters to zero because the data the page sees is already filtered.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Plus, Search } from 'lucide-react';
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
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { SkeletonList } from '@/components/common/Skeleton';
import { UserActionMenu } from '@/components/admin/UserActionMenu';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useAnonymizeUser,
  useDisableUser,
  useEnableUser,
  useForceLogout,
  useResetUserPassword,
  useUsers,
} from '@/hooks/api/useUsers';
import type { GlobalRole, Problem } from '@/api/types';
import type { UserDetail } from '@/api/endpoints/users';
import { roleLabel } from '@/lib/roles';
import { cn } from '@/components/ui/utils';

type RoleFilter = 'all' | GlobalRole;

const FILTERS: { id: RoleFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'teacher', label: 'Преподаватели' },
  { id: 'assistant', label: 'Ассистенты' },
  { id: 'student', label: 'Студенты' },
  { id: 'admin', label: 'Админы' },
];

function initials(name?: string | null): string {
  if (!name) return 'U';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function roleBadge(role: GlobalRole) {
  const tone: 'info' | 'neutral' = role === 'admin' ? 'info' : 'neutral';
  return <StatusPill tone={tone}>{roleLabel(role)}</StatusPill>;
}

export function UsersListPage() {
  useDocumentTitle('Пользователи');
  const navigate = useNavigate();
  const notify = useNotifications();
  // tenant_id from the URL — set by ?tenant_id=... when the admin clicks
  // "Open users" from a specific tenant detail page. Backend already
  // enforces tenant scoping for non-admins; for admins we forward the
  // hint explicitly so they only see this tenant.
  const [searchParams] = useSearchParams();
  const tenantIdFilter = searchParams.get('tenant_id') || undefined;

  const [filter, setFilter] = useState<RoleFilter>('all');
  const [q, setQ] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    user: UserDetail;
    kind: 'anonymize';
  } | null>(null);

  // Main query — narrowed by the currently selected role tab and by search.
  const filters = useMemo(
    () => ({
      q: q || undefined,
      role: filter === 'all' ? undefined : (filter as GlobalRole),
      tenant_id: tenantIdFilter,
      limit: 100,
    }),
    [q, filter, tenantIdFilter],
  );

  // Counter query — same tenant + same search, but ALL roles. Without this
  // the per-role counters in the tabs would collapse to zero as soon as the
  // user picked any tab other than "Все", because the main `list` is then
  // narrowed to a single role.
  const counterFilters = useMemo(
    () => ({
      q: q || undefined,
      tenant_id: tenantIdFilter,
      limit: 500,
    }),
    [q, tenantIdFilter],
  );

  const { data, isPending, error, refetch } = useUsers(filters);
  const countersQuery = useUsers(counterFilters);
  const disable = useDisableUser();
  const enable = useEnableUser();
  const anonymize = useAnonymizeUser();
  const reset = useResetUserPassword();
  const forceLogout = useForceLogout();

  const all = countersQuery.data?.data ?? [];
  const counts: Record<RoleFilter, number> = {
    all: all.length,
    admin: all.filter((u) => u.global_role === 'admin').length,
    teacher: all.filter((u) => u.global_role === 'teacher').length,
    assistant: all.filter((u) => u.global_role === 'assistant').length,
    student: all.filter((u) => u.global_role === 'student').length,
  };

  const handleDisable = async (u: UserDetail) => {
    try {
      await disable.mutateAsync(u.id);
      notify.success('Пользователь заблокирован');
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleEnable = async (u: UserDetail) => {
    try {
      await enable.mutateAsync(u.id);
      notify.success('Разблокирован');
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleAnonymize = async (u: UserDetail) => {
    try {
      await anonymize.mutateAsync(u.id);
      notify.success('Анонимизирован');
      refetch();
      setConfirmAction(null);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleReset = async (u: UserDetail) => {
    try {
      await reset.mutateAsync(u.id);
      notify.success('Reset link отправлен');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleForceLogout = async (u: UserDetail) => {
    try {
      await forceLogout.mutateAsync(u.id);
      notify.success('Сессии завершены');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const rows = data?.data ?? [];

  return (
    <>
      <Page width="wide">
        <PageHeader
          title={<span data-testid="users-title">Пользователи</span>}
          action={
            <Button asChild data-testid="users-new-button">
              <Link to="/admin/users/new">
                <Plus className="mr-2 h-4 w-4" />
                Создать
              </Link>
            </Button>
          }
        />

        {/*
         * One self-contained card holds the whole list: filter bar, optional
         * error, then the table. No outer borders bleed into the page so the
         * layout stays calm.
         */}
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* Filter bar */}
          <div className="flex flex-col gap-3 border-b bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label="Фильтр по роли"
              className="flex flex-wrap items-center gap-1"
            >
              {FILTERS.map((f) => {
                const active = f.id === filter;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    data-testid={`users-filter-${f.id}`}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-xs tabular-nums',
                        active ? 'bg-background/15 text-background' : 'text-muted-foreground/80',
                      )}
                    >
                      {counts[f.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                placeholder="Найти по email или имени"
                className="h-9 pl-9"
                data-testid="users-search-input"
              />
            </div>
          </div>

          {error && (
            <div className="p-4">
              <ProblemAlert problem={error as unknown as Problem} />
            </div>
          )}

          {isPending && !data ? (
            <div className="p-4">
              <SkeletonList rows={5} rowHeight={56} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10">
              <EmptyState title="Никого не нашли" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead>Пользователь</TableHead>
                  <TableHead className="w-40">Роль</TableHead>
                  <TableHead className="w-28">Статус</TableHead>
                  <TableHead className="w-40">Последний вход</TableHead>
                  <TableHead className="w-12 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => {
                  const lastSeen = u.last_login_at
                    ? dayjs(u.last_login_at).fromNow()
                    : '—';
                  return (
                    <TableRow
                      key={u.id}
                      data-testid={`user-row-${u.id}`}
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
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
                            <div className="truncate text-xs text-muted-foreground">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{roleBadge(u.global_role)}</TableCell>
                      <TableCell>
                        {u.status === 'active' ? (
                          <StatusPill tone="success">активен</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">отключён</StatusPill>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {lastSeen}
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <UserActionMenu
                          user={u}
                          onView={() => navigate(`/admin/users/${u.id}`)}
                          onResetPassword={handleReset}
                          onForceLogout={handleForceLogout}
                          onDisable={handleDisable}
                          onEnable={handleEnable}
                          onAnonymize={(usr) =>
                            setConfirmAction({
                              user: usr,
                              kind: 'anonymize',
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Page>

      <ConfirmDialog
        opened={confirmAction != null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          confirmAction?.kind === 'anonymize' &&
          handleAnonymize(confirmAction.user)
        }
        title="Анонимизировать пользователя"
        message="Это действие необратимо. Все персональные данные будут удалены, audit-события сохранятся."
        confirmLabel="Анонимизировать"
        destructive
      />
    </>
  );
}

export default UsersListPage;
