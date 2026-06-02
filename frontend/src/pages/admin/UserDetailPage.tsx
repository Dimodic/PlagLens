/**
 * /admin/users/:id — admin user detail page.
 *
 * Seven tabs, all rendered in open layout (no card chrome — see
 * .claude/UI_RULES.md):
 *   Профиль · Привязки · OAuth · Сессии · API-ключи · Аудит · Действия
 *
 * The audit tab embeds the same per-actor feed as the dedicated audit
 * route — admins don't have to jump around just to see what a user did.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { shortId } from '@/utils/formatters';
import {
  Ban,
  Key,
  LogOut,
  ShieldOff,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import { EmptyState } from '@/components/common/EmptyState';
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
import { PageSkeleton } from '@/components/common/Skeleton';
import { SessionsTable } from '@/components/me/SessionsTable';
import { AuditEventCard } from '@/components/admin/AuditEventCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuditByActor } from '@/hooks/api/useAudit';
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
import { RoleBadge } from '@/components/common/RoleBadge';
import type { GlobalRole, Problem } from '@/api/types';

export function UserDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  useDocumentTitle(t('user_detail.doc_title'));
  const notify = useNotifications();
  const userQ = useUser(id);
  const sessionsQ = useUserSessions(id);
  const bindingsQ = useUserExternalBindings(id);
  const oauthQ = useUserOAuthIdentities(id);
  const apiKeysQ = useUserApiKeys(id);
  const auditQ = useAuditByActor(id, { limit: 50 });
  const update = useUpdateUser(id ?? '');
  const revokeKey = useRevokeApiKey(id ?? '');
  const disable = useDisableUser();
  const enable = useEnableUser();
  const anonymize = useAnonymizeUser();
  const resetPassword = useResetUserPassword();
  const forceLogout = useForceLogout();

  const [name, setName] = useState('');
  const [role, setRole] = useState<GlobalRole>('student');
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmForceLogout, setConfirmForceLogout] = useState(false);

  useEffect(() => {
    if (userQ.data) {
      setName(userQ.data.display_name);
      setRole(userQ.data.global_role);
    }
  }, [userQ.data]);

  if (userQ.isLoading && !userQ.data) {
    // Mirror the loaded layout: regular-width page, title + meta row, the
    // 7-tab strip, then a few rows echoing the default Профиль form fields.
    return <PageSkeleton width="regular" rows={3} />;
  }
  if (userQ.error) {
    return <ProblemAlert problem={userQ.error as unknown as Problem} />;
  }

  const u = userQ.data;
  if (!u) return null;

  const handleSave = async () => {
    // Locale isn't editable from admin — it's the user's own preference,
    // managed under /me/profile. Admin only touches identity + role.
    try {
      await update.mutateAsync({
        display_name: name,
        global_role: role,
      });
      notify.success(t('user_detail.notify_saved'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('user_detail.notify_failed'));
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      await revokeKey.mutateAsync(keyId);
      notify.success(t('user_detail.notify_key_revoked'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('user_detail.notify_failed'));
    }
  };

  const handleDisable = async () => {
    try {
      await disable.mutateAsync(u.id);
      notify.success(t('user_detail.notify_disabled'));
      setConfirmDisable(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('user_detail.notify_failed'));
    }
  };

  const handleEnable = async () => {
    try {
      await enable.mutateAsync(u.id);
      notify.success(t('user_detail.notify_enabled'));
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('user_detail.notify_failed'));
    }
  };

  const handleAnonymize = async () => {
    try {
      await anonymize.mutateAsync(u.id);
      notify.success(t('user_detail.notify_anonymized'));
      setConfirmAnonymize(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('user_detail.notify_failed'));
    }
  };

  const handleResetPassword = async () => {
    try {
      await resetPassword.mutateAsync(u.id);
      notify.success(t('user_detail.notify_reset_sent'));
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('user_detail.notify_failed'));
    }
  };

  const handleForceLogout = async () => {
    try {
      await forceLogout.mutateAsync(u.id);
      notify.success(t('user_detail.notify_sessions_ended'));
      setConfirmForceLogout(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('user_detail.notify_failed'));
    }
  };

  return (
    <Page width="regular">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{u.display_name}</h1>
        <div className="mt-2 flex items-center gap-2">
          <RoleBadge role={u.global_role} />
          <StatusPill tone={u.status === 'active' ? 'success' : 'neutral'}>
            {u.status === 'active' ? t('user_detail.status_active') : t('user_detail.status_disabled')}
          </StatusPill>
          <span className="font-mono text-xs text-muted-foreground">ID: {shortId(u.id)}</span>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="user-tab-profile">{t('user_detail.tab_profile')}</TabsTrigger>
          <TabsTrigger value="bindings" data-testid="user-tab-bindings">{t('user_detail.tab_bindings')}</TabsTrigger>
          <TabsTrigger value="oauth" data-testid="user-tab-oauth">OAuth</TabsTrigger>
          <TabsTrigger value="sessions" data-testid="user-tab-sessions">{t('user_detail.tab_sessions')}</TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="user-tab-api-keys">{t('user_detail.tab_api_keys')}</TabsTrigger>
          <TabsTrigger value="audit" data-testid="user-tab-audit">{t('user_detail.tab_audit')}</TabsTrigger>
          <TabsTrigger value="actions" data-testid="user-tab-actions">{t('user_detail.tab_actions')}</TabsTrigger>
        </TabsList>

        {/* ===== Профиль ===== */}
        <TabsContent value="profile" className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="user-detail-email">{t('user_detail.field_email')}</Label>
            <Input id="user-detail-email" value={u.email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-detail-name">{t('user_detail.field_name')}</Label>
            <Input
              id="user-detail-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-detail-role">{t('user_detail.field_role')}</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole((v as GlobalRole) ?? 'student')}
            >
              <SelectTrigger id="user-detail-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">{t('user_detail.role_student')}</SelectItem>
                <SelectItem value="assistant">{t('user_detail.role_assistant')}</SelectItem>
                <SelectItem value="teacher">{t('user_detail.role_teacher')}</SelectItem>
                <SelectItem value="admin">{t('user_detail.role_admin')}</SelectItem>
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
              {t('common.save')}
            </Button>
          </div>
        </TabsContent>

        {/* ===== Привязки (external_bindings) ===== */}
        <TabsContent value="bindings" className="pt-6">
          {bindingsQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : bindingsQ.data && bindingsQ.data.length > 0 ? (
            <div className="divide-y divide-border/50 border-y border-border/50">
              {bindingsQ.data.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusPill tone="neutral">{b.system}</StatusPill>
                    <span className="truncate font-mono text-sm">{b.external_id}</span>
                    {b.display_name && (
                      <span className="truncate text-sm text-muted-foreground">
                        {b.display_name}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dayjs(b.linked_at).format('DD.MM.YYYY')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title={t('user_detail.bindings_empty')} />
          )}
        </TabsContent>

        {/* ===== OAuth ===== */}
        <TabsContent value="oauth" className="pt-6">
          {oauthQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : oauthQ.data && oauthQ.data.length > 0 ? (
            <div className="divide-y divide-border/50 border-y border-border/50">
              {oauthQ.data.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusPill tone="neutral">{o.provider}</StatusPill>
                    <span className="truncate text-sm">{o.email}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dayjs(o.linked_at).format('DD.MM.YYYY')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title={t('user_detail.oauth_empty')} />
          )}
        </TabsContent>

        {/* ===== Сессии ===== */}
        <TabsContent value="sessions" className="pt-6">
          {sessionsQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <SessionsTable sessions={sessionsQ.data ?? []} showCurrent={false} />
          )}
        </TabsContent>

        {/* ===== API-ключи ===== */}
        <TabsContent value="api-keys" className="pt-6">
          {apiKeysQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : apiKeysQ.error ? (
            <ProblemAlert problem={apiKeysQ.error as unknown as Problem} />
          ) : apiKeysQ.data && apiKeysQ.data.length > 0 ? (
            <Table data-testid="user-api-keys-table">
              <TableHeader>
                <TableRow className="border-y">
                  <TableHead>{t('user_detail.col_name')}</TableHead>
                  <TableHead>{t('user_detail.col_prefix')}</TableHead>
                  <TableHead>{t('user_detail.col_last_used')}</TableHead>
                  <TableHead>{t('user_detail.col_expires')}</TableHead>
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
                            <StatusPill tone="neutral">{t('user_detail.key_revoked')}</StatusPill>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
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
                            : t('user_detail.no_expiry')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {!revoked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevokeKey(k.id)}
                            disabled={revokeKey.isPending}
                            aria-label={t('user_detail.revoke_key_aria')}
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
            <EmptyState title={t('user_detail.api_keys_empty')} />
          )}
        </TabsContent>

        {/* ===== Аудит ===== */}
        <TabsContent value="audit" className="space-y-4 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t('user_detail.audit_caption')}
            </p>
            {auditQ.data && auditQ.data.data.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('user_detail.audit_events_count', { count: auditQ.data.data.length })}
              </span>
            )}
          </div>
          {auditQ.error && <ProblemAlert problem={auditQ.error as unknown as Problem} />}
          {auditQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : auditQ.data && auditQ.data.data.length > 0 ? (
            <div className="space-y-3">
              {auditQ.data.data.map((e) => (
                <AuditEventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <EmptyState title={t('user_detail.audit_empty')} />
          )}
        </TabsContent>

        {/* ===== Действия ===== */}
        <TabsContent value="actions" className="space-y-4 pt-6" data-testid="user-actions-panel">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('user_detail.reset_password_title')}</p>
            <p className="text-xs text-muted-foreground">
              {t('user_detail.reset_password_desc')}
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
                {t('user_detail.reset_password_btn')}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="text-sm font-medium">{t('user_detail.force_logout_title')}</p>
            <p className="text-xs text-muted-foreground">
              {t('user_detail.force_logout_desc')}
            </p>
            <div className="pt-1">
              <Button
                variant="outline"
                onClick={() => setConfirmForceLogout(true)}
                data-testid="user-action-force-logout"
                className="border-amber-600 text-amber-600 hover:text-amber-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('user_detail.force_logout_btn')}
              </Button>
            </div>
          </div>

          <Separator />

          {u.status === 'active' ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('user_detail.disable_title')}</p>
              <p className="text-xs text-muted-foreground">
                {t('user_detail.disable_desc')}
              </p>
              <div className="pt-1">
                <Button
                  variant="outline"
                  onClick={() => setConfirmDisable(true)}
                  data-testid="user-action-disable"
                  className="border-destructive text-destructive hover:text-destructive"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {t('user_detail.disable_btn')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('user_detail.enable_title')}</p>
              <p className="text-xs text-muted-foreground">
                {t('user_detail.enable_desc')}
              </p>
              <div className="pt-1">
                <Button
                  variant="outline"
                  onClick={handleEnable}
                  disabled={enable.isPending}
                  data-testid="user-action-enable"
                  className="border-emerald-600 text-emerald-600 hover:text-emerald-600"
                >
                  {enable.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="mr-2 h-4 w-4" />
                  )}
                  {t('user_detail.enable_btn')}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              {t('user_detail.anonymize_title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('user_detail.anonymize_desc')}
            </p>
            <div className="pt-1">
              <Button
                variant="outline"
                onClick={() => setConfirmAnonymize(true)}
                data-testid="user-action-anonymize"
                className="border-destructive text-destructive hover:text-destructive"
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                {t('user_detail.anonymize_btn')}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        opened={confirmAnonymize}
        onClose={() => setConfirmAnonymize(false)}
        onConfirm={handleAnonymize}
        title={t('user_detail.confirm_anonymize_title')}
        message={t('user_detail.confirm_anonymize_message')}
        confirmLabel={t('user_detail.anonymize_btn')}
        destructive
        loading={anonymize.isPending}
      />
      <ConfirmDialog
        opened={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        onConfirm={handleDisable}
        title={t('user_detail.confirm_disable_title')}
        message={t('user_detail.confirm_disable_message')}
        confirmLabel={t('user_detail.disable_btn')}
        destructive
        loading={disable.isPending}
      />
      <ConfirmDialog
        opened={confirmForceLogout}
        onClose={() => setConfirmForceLogout(false)}
        onConfirm={handleForceLogout}
        title={t('user_detail.confirm_force_logout_title')}
        message={t('user_detail.confirm_force_logout_message')}
        confirmLabel={t('user_detail.confirm_force_logout_btn')}
        loading={forceLogout.isPending}
      />
    </Page>
  );
}

export default UserDetailPage;
