/**
 * /admin/users/:id — admin user detail with tabs.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Ban,
  Key,
  LogOut,
  ShieldOff,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import { Page } from '@/components/layout/Page';
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
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { SkeletonList } from '@/components/common/Skeleton';
import { SessionsTable } from '@/components/me/SessionsTable';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useAnonymizeUser,
  useDisableUser,
  useEnableUser,
  useForceLogout,
  useResetUserPassword,
  useRevokeApiKey,
  useUpdateUser,
  useUser,
  useUserApiKeys,
  useUserExternalBindings,
  useUserOAuthIdentities,
  useUserSessions,
} from '@/hooks/api/useUsers';
import type { GlobalRole, Problem } from '@/api/types';

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Пользователь');
  const notify = useNotifications();
  const userQ = useUser(id);
  const sessionsQ = useUserSessions(id);
  const bindingsQ = useUserExternalBindings(id);
  const oauthQ = useUserOAuthIdentities(id);
  const apiKeysQ = useUserApiKeys(id);
  const update = useUpdateUser(id ?? '');
  const revokeKey = useRevokeApiKey(id ?? '');
  const disable = useDisableUser();
  const enable = useEnableUser();
  const anonymize = useAnonymizeUser();
  const resetPassword = useResetUserPassword();
  const forceLogout = useForceLogout();

  const [name, setName] = useState('');
  const [locale, setLocale] = useState('ru');
  const [role, setRole] = useState<GlobalRole>('student');
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmForceLogout, setConfirmForceLogout] = useState(false);

  useEffect(() => {
    if (userQ.data) {
      setName(userQ.data.display_name);
      setLocale(userQ.data.locale);
      setRole(userQ.data.global_role);
    }
  }, [userQ.data]);

  if (userQ.isLoading && !userQ.data) {
    return (
      <div className="space-y-6">
        <SkeletonList rows={5} rowHeight={48} />
      </div>
    );
  }
  if (userQ.error) {
    return <ProblemAlert problem={userQ.error as unknown as Problem} />;
  }

  const u = userQ.data;
  if (!u) return null;

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        display_name: name,
        locale,
        global_role: role,
      });
      notify.success('Сохранено');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      await revokeKey.mutateAsync(keyId);
      notify.success('Ключ отозван');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  const handleDisable = async () => {
    if (!u) return;
    try {
      await disable.mutateAsync(u.id);
      notify.success('Пользователь заблокирован');
      setConfirmDisable(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleEnable = async () => {
    if (!u) return;
    try {
      await enable.mutateAsync(u.id);
      notify.success('Разблокирован');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleAnonymize = async () => {
    if (!u) return;
    try {
      await anonymize.mutateAsync(u.id);
      notify.success('Анонимизирован');
      setConfirmAnonymize(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleResetPassword = async () => {
    if (!u) return;
    try {
      await resetPassword.mutateAsync(u.id);
      notify.success('Reset link отправлен');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleForceLogout = async () => {
    if (!u) return;
    try {
      await forceLogout.mutateAsync(u.id);
      notify.success('Сессии завершены');
      setConfirmForceLogout(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Page width="regular">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{u.display_name}</h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusPill tone="neutral">{u.global_role}</StatusPill>
          <StatusPill tone={u.status === 'active' ? 'success' : 'neutral'}>
            {u.status}
          </StatusPill>
          <span className="text-xs font-mono text-muted-foreground">{u.id}</span>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="user-tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="bindings" data-testid="user-tab-bindings">External</TabsTrigger>
          <TabsTrigger value="oauth" data-testid="user-tab-oauth">OAuth</TabsTrigger>
          <TabsTrigger value="sessions" data-testid="user-tab-sessions">Sessions</TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="user-tab-api-keys">API keys</TabsTrigger>
          <TabsTrigger value="audit" data-testid="user-tab-audit">Audit</TabsTrigger>
          <TabsTrigger value="actions" data-testid="user-tab-actions">Действия</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-detail-email">Email</Label>
                <Input id="user-detail-email" value={u.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-detail-name">Display name</Label>
                <Input
                  id="user-detail-name"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-detail-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole((v as GlobalRole) ?? 'student')}
                >
                  <SelectTrigger id="user-detail-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">student</SelectItem>
                    <SelectItem value="teacher">teacher</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="super_admin">super_admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-detail-locale">Locale</Label>
                <Select value={locale} onValueChange={(v) => setLocale(v ?? 'ru')}>
                  <SelectTrigger id="user-detail-locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">ru</SelectItem>
                    <SelectItem value="en">en</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end">
                <Button
                  onClick={handleSave}
                  disabled={update.isPending}
                  data-testid="user-detail-save"
                >
                  {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Сохранить
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bindings" className="pt-4">
          {bindingsQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Card>
              <CardContent className="p-6">
                {bindingsQ.data && bindingsQ.data.length > 0 ? (
                  <div className="space-y-3">
                    {bindingsQ.data.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <StatusPill tone="neutral">{b.system}</StatusPill>
                          <span className="text-sm font-mono">{b.external_id}</span>
                          <span className="text-sm text-muted-foreground">
                            {b.display_name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(b.linked_at).format('DD.MM.YYYY')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Привязок нет</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="oauth" className="pt-4">
          {oauthQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Card>
              <CardContent className="p-6">
                {oauthQ.data && oauthQ.data.length > 0 ? (
                  <div className="space-y-3">
                    {oauthQ.data.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <StatusPill tone="neutral">{o.provider}</StatusPill>
                          <span className="text-sm">{o.email}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(o.linked_at).format('DD.MM.YYYY')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Нет привязанных OAuth-провайдеров
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="pt-4">
          {sessionsQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Card>
              <CardContent className="p-6">
                <SessionsTable sessions={sessionsQ.data ?? []} showCurrent={false} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="api-keys" className="pt-4">
          <Card>
            <CardContent className="p-6">
              {apiKeysQ.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : apiKeysQ.error ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Не удалось загрузить ключи. Возможно, endpoint ещё не подключён
                    на backend.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    GET /admin/users/:id/api-keys — TODO
                  </p>
                </div>
              ) : apiKeysQ.data && apiKeysQ.data.length > 0 ? (
                <Table data-testid="user-api-keys-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Имя</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-14" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeysQ.data.map((k) => {
                      const revoked = !!k.revoked_at;
                      return (
                        <TableRow key={k.id} data-testid={`user-api-key-row-${k.id}`}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">{k.name}</span>
                              {revoked && (
                                <StatusPill tone="neutral">revoked</StatusPill>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-mono text-muted-foreground">
                              {k.id.slice(0, 8)}…
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {k.last_used_at
                                ? dayjs(k.last_used_at).fromNow()
                                : '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {k.expires_at
                                ? dayjs(k.expires_at).format('DD.MM.YYYY')
                                : 'без срока'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {!revoked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRevokeKey(k.id)}
                                disabled={revokeKey.isPending}
                                aria-label="Revoke key"
                                data-testid={`user-api-key-revoke-${k.id}`}
                                className="text-destructive hover:text-destructive"
                              >
                                {revokeKey.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Ban className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  У пользователя нет API-ключей.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <Card>
            <CardContent className="p-6">
              <Button asChild variant="outline">
                <Link to={`/admin/audit/actors/${u.id}`}>Открыть аудит пользователя</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="pt-4">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4" data-testid="user-actions-panel">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Сбросить пароль</p>
                  <p className="text-xs text-muted-foreground">
                    На email пользователя будет отправлена ссылка для сброса.
                  </p>
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      onClick={handleResetPassword}
                      disabled={resetPassword.isPending}
                      data-testid="user-action-reset-password"
                    >
                      {resetPassword.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="mr-2 h-4 w-4" />
                      )}
                      Отправить reset link
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1">
                  <p className="text-sm font-medium">Завершить все сессии</p>
                  <p className="text-xs text-muted-foreground">
                    Пользователь будет принудительно разлогинен на всех устройствах.
                  </p>
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmForceLogout(true)}
                      data-testid="user-action-force-logout"
                      className="text-amber-600 border-amber-600 hover:text-amber-600"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Force logout
                    </Button>
                  </div>
                </div>

                <Separator />

                {u.status === 'active' ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Заблокировать</p>
                    <p className="text-xs text-muted-foreground">
                      Пользователь не сможет войти. Данные сохраняются.
                    </p>
                    <div className="pt-1">
                      <Button
                        variant="outline"
                        onClick={() => setConfirmDisable(true)}
                        data-testid="user-action-disable"
                        className="text-destructive border-destructive hover:text-destructive"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Заблокировать
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Разблокировать</p>
                    <p className="text-xs text-muted-foreground">
                      Восстановит доступ пользователя.
                    </p>
                    <div className="pt-1">
                      <Button
                        variant="outline"
                        onClick={handleEnable}
                        disabled={enable.isPending}
                        data-testid="user-action-enable"
                        className="text-emerald-600 border-emerald-600 hover:text-emerald-600"
                      >
                        {enable.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <UserCheck className="mr-2 h-4 w-4" />
                        )}
                        Разблокировать
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">
                    Анонимизировать (GDPR)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Необратимо. Персональные данные удаляются, audit-события сохраняются.
                  </p>
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAnonymize(true)}
                      data-testid="user-action-anonymize"
                      className="text-destructive border-destructive hover:text-destructive"
                    >
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Анонимизировать
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        opened={confirmAnonymize}
        onClose={() => setConfirmAnonymize(false)}
        onConfirm={handleAnonymize}
        title="Анонимизировать пользователя"
        message="Это действие необратимо. Все персональные данные будут удалены, audit-события сохранятся."
        confirmLabel="Анонимизировать"
        destructive
        loading={anonymize.isPending}
      />
      <ConfirmDialog
        opened={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        onConfirm={handleDisable}
        title="Заблокировать пользователя"
        message="Пользователь не сможет войти, пока не будет разблокирован."
        confirmLabel="Заблокировать"
        destructive
        loading={disable.isPending}
      />
      <ConfirmDialog
        opened={confirmForceLogout}
        onClose={() => setConfirmForceLogout(false)}
        onConfirm={handleForceLogout}
        title="Завершить все сессии"
        message="Все активные сессии пользователя будут отозваны. Пользователь будет разлогинен на всех устройствах."
        confirmLabel="Завершить"
        loading={forceLogout.isPending}
      />
    </Page>
  );
}

export default UserDetailPage;
