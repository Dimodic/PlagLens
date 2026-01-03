/**
 * /admin/users — admin users list with role filter, search and bulk actions.
 *
 * Tabs role filter, search box, table with avatar + name + email + role +
 * status. Click row → user detail. All existing behaviour preserved through
 * `UserActionMenu`. Test ids unchanged.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Plus, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

type RoleFilter = 'all' | GlobalRole;

const FILTERS: { id: RoleFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'teacher', label: 'Преподаватели' },
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
  if (role === 'super_admin' || role === 'admin') {
    return <StatusPill tone="info">{role}</StatusPill>;
  }
  if (role === 'teacher') {
    return <StatusPill tone="neutral">{role}</StatusPill>;
  }
  return <StatusPill tone="neutral">{role}</StatusPill>;
}

export function UsersListPage() {
  useDocumentTitle('Пользователи');
  const navigate = useNavigate();
  const notify = useNotifications();

  const [filter, setFilter] = useState<RoleFilter>('all');
  const [q, setQ] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    user: UserDetail;
    kind: 'anonymize';
  } | null>(null);

  const filters = useMemo(
    () => ({
      q: q || undefined,
      role: filter === 'all' ? undefined : (filter as GlobalRole),
      limit: 100,
    }),
    [q, filter],
  );

  const { data, isPending, error, refetch } = useUsers(filters);
  const disable = useDisableUser();
  const enable = useEnableUser();
  const anonymize = useAnonymizeUser();
  const reset = useResetUserPassword();
  const forceLogout = useForceLogout();

  const list = data?.data ?? [];
  const counts: Record<RoleFilter, number> = {
    all: list.length,
    super_admin: 0,
    admin: list.filter((u) => u.global_role === 'admin').length,
    teacher: list.filter((u) => u.global_role === 'teacher').length,
    student: list.filter((u) => u.global_role === 'student').length,
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

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as RoleFilter)}
          >
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f.id} value={f.id}>
                  {f.label}
                  <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                    {counts[f.id]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              placeholder="Поиск по email или имени"
              className="pl-9"
              data-testid="users-search-input"
            />
          </div>
        </div>

        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isPending && !data ? (
          <SkeletonList rows={5} rowHeight={56} />
        ) : data && data.data.length === 0 ? (
          <EmptyState title="Не найдено" />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Активность</TableHead>
                    <TableHead className="w-12 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.data ?? []).map((u) => {
                    const lastSeen = u.last_login_at
                      ? dayjs(u.last_login_at).fromNow()
                      : '—';
                    return (
                      <TableRow
                        key={u.id}
                        data-testid={`user-row-${u.id}`}
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                        className="cursor-pointer"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                                {initials(u.display_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {u.display_name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{roleBadge(u.global_role)}</TableCell>
                        <TableCell>
                          {u.status === 'active' ? (
                            <StatusPill tone="success">active</StatusPill>
                          ) : (
                            <StatusPill tone="neutral">disabled</StatusPill>
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
            </CardContent>
          </Card>
        )}
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
