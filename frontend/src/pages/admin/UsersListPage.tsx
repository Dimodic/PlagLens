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
import { Skeleton } from '@/components/ui/skeleton';
import { UserActionMenu } from '@/components/admin/UserActionMenu';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
import { useAuth } from '@/auth/useAuth';
import type { GlobalRole, Problem } from '@/api/types';
import type { UserDetail } from '@/api/endpoints/users';
import { RoleBadge } from '@/components/common/RoleBadge';
import { cn } from '@/components/ui/utils';

type RoleFilter = 'all' | GlobalRole;

const FILTERS: { id: RoleFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'users_list.filter_all' },
  { id: 'teacher', labelKey: 'users_list.filter_teacher' },
  { id: 'assistant', labelKey: 'users_list.filter_assistant' },
  { id: 'student', labelKey: 'users_list.filter_student' },
  { id: 'admin', labelKey: 'users_list.filter_admin' },
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
  return <RoleBadge role={role} />;
}

/**
 * Loading state for the user table — mirrors the real layout instead of a flat
 * row-stack: a thin column-header bar over rows that each carry a round avatar
 * + two stacked text lines (name / email) and blocks for the role / status /
 * last-login / action columns, matching their `w-40 / w-28 / w-40 / w-12`
 * widths. Quiet `bg-muted/30–40` tone so it reads as a placeholder.
 */
function UsersTableSkeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" aria-label={t('skeleton.aria_label')}>
      {/* Column-header bar — mirrors the real <TableHeader> border + labels. */}
      <div className="flex items-center gap-4 border-y py-3">
        <Skeleton className="h-3 w-24 rounded bg-muted/40" />
        <Skeleton className="ml-auto h-3 w-20 shrink-0 rounded bg-muted/40" />
        <Skeleton className="h-3 w-16 shrink-0 rounded bg-muted/40" />
        <Skeleton className="h-3 w-24 shrink-0 rounded bg-muted/40" />
        <span className="w-8 shrink-0" />
      </div>
      {/* Rows — avatar + name/email, then role / status / last-login / action. */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-muted/40" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40 max-w-[55%] rounded bg-muted/40" />
              <Skeleton className="h-3 w-56 max-w-[75%] rounded bg-muted/30" />
            </div>
          </div>
          <Skeleton className="h-5 w-20 shrink-0 rounded-full bg-muted/30" />
          <Skeleton className="h-5 w-16 shrink-0 rounded-full bg-muted/30" />
          <Skeleton className="h-3 w-24 shrink-0 rounded bg-muted/30" />
          <Skeleton className="h-5 w-5 shrink-0 rounded bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

export function UsersListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('users_list.title'));
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
  // ``limit`` MUST stay within the backend's GET /users cap (≤ 200) — we
  // used to pass 500 and the endpoint 422'd, which silently zeroed every
  // tab counter even when the main list rendered fine.
  const counterFilters = useMemo(
    () => ({
      q: q || undefined,
      tenant_id: tenantIdFilter,
      limit: 200,
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
  const setRole = useSetUserRole();
  // Role change is admin-only on the backend — only show the switcher to
  // admins so a teacher (who can list users) doesn't get a 403 on click.
  const { user: me } = useAuth();
  const isAdmin = me?.global_role === 'admin';

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
      notify.success(t('users_list.notify_disabled'));
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  const handleEnable = async (u: UserDetail) => {
    try {
      await enable.mutateAsync(u.id);
      notify.success(t('users_list.notify_enabled'));
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  const handleAnonymize = async (u: UserDetail) => {
    try {
      await anonymize.mutateAsync(u.id);
      notify.success(t('users_list.notify_anonymized'));
      refetch();
      setConfirmAction(null);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  const handleReset = async (u: UserDetail) => {
    try {
      await reset.mutateAsync(u.id);
      notify.success(t('users_list.notify_reset_sent'));
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  const handleForceLogout = async (u: UserDetail) => {
    try {
      await forceLogout.mutateAsync(u.id);
      notify.success(t('users_list.notify_sessions_ended'));
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  const handleChangeRole = async (u: UserDetail, role: GlobalRole) => {
    try {
      await setRole.mutateAsync({ id: u.id, role });
      notify.success(t('users_list.notify_role_changed'));
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('users_list.action_failed'));
    }
  };

  const rows = data?.data ?? [];

  return (
    <>
      <Page width="wide">
        <PageHeader
          title={<span data-testid="users-title">{t('users_list.title')}</span>}
          action={
            <Button asChild data-testid="users-new-button">
              <Link to="/admin/users/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('users_list.create')}
              </Link>
            </Button>
          }
        />

        {/*
         * Open layout — no card chrome wraps the page. A single hairline
         * under the filter bar separates it from the table, and the table's
         * own thead/row borders carry the rest of the structure.
         */}
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label={t('users_list.filter_aria')}
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
                  {t(f.labelKey)}
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
              placeholder={t('users_list.search_placeholder')}
              className="h-9 pl-9"
              data-testid="users-search-input"
            />
          </div>
        </div>

        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isPending && !data ? (
          <UsersTableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('users_list.empty')} />
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
              {rows.map((u) => {
                  // Blank, not «—», when the user never logged in: most
                  // imported accounts have no login, and a column of
                  // dashes just adds visual noise.
                  const lastSeen = u.last_login_at
                    ? dayjs(u.last_login_at).fromNow()
                    : '';
                  return (
                    <TableRow
                      key={u.id}
                      data-testid={`user-row-${u.id}`}
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                      // No per-row divider — 150+ hairlines read as noise.
                      // Rows are separated by height + hover tint instead.
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
                            <div className="truncate text-xs text-muted-foreground">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{roleBadge(u.global_role)}</TableCell>
                      <TableCell>
                        {u.status === 'active' ? (
                          <StatusPill tone="success">{t('users_list.status_active')}</StatusPill>
                        ) : (
                          <StatusPill tone="destructive">{t('users_list.status_disabled')}</StatusPill>
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
                          onChangeRole={isAdmin ? handleChangeRole : undefined}
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
      </Page>

      <ConfirmDialog
        opened={confirmAction != null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          confirmAction?.kind === 'anonymize' &&
          handleAnonymize(confirmAction.user)
        }
        title={t('users_list.anonymize_title')}
        message={t('users_list.anonymize_message')}
        confirmLabel={t('users_list.anonymize_confirm')}
        destructive
      />
    </>
  );
}

export default UsersListPage;
