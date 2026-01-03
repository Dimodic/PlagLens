/**
 * /me/security — password, 2FA, OAuth identities, sessions.
 */
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '@/layout/Breadcrumbs';
import { Page, PageHeader } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { SessionsTable } from '@/components/me/SessionsTable';
import { OAuthLinksList } from '@/components/me/OAuthLinksList';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useChangePassword,
  useDisable2FA,
  useEnroll2FA,
  useEnable2FA,
  useMySessions,
  useRevokeSession,
  useUnlinkOAuth,
} from '@/hooks/api/useUsers';
import { useAuth } from '@/auth/useAuth';
import type { OAuthProvider, Problem } from '@/api/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function PasswordChangeCard() {
  const notify = useNotifications();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const handle = async () => {
    setProblem(null);
    if (next !== confirm) {
      setProblem({
        title: 'Пароли не совпадают',
        status: 400,
        code: 'MISMATCH',
      });
      return;
    }
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      notify.success('Пароль изменён');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Смена пароля</h2>
          {problem && <ProblemAlert problem={problem} />}
          <div className="space-y-1.5">
            <Label htmlFor="profile-password-current">Текущий пароль</Label>
            <Input
              id="profile-password-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.currentTarget.value)}
              data-testid="profile-password-current"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-password-new">Новый пароль</Label>
            <Input
              id="profile-password-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.currentTarget.value)}
              data-testid="profile-password-new"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-password-confirm">Подтверждение</Label>
            <Input
              id="profile-password-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              data-testid="profile-password-confirm"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handle}
              disabled={change.isPending}
              data-testid="profile-password-submit"
            >
              {change.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сменить
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const enroll = useEnroll2FA();
  const enableM = useEnable2FA();
  const disableM = useDisable2FA();
  const [otpAuth, setOtpAuth] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');

  const startEnroll = async () => {
    try {
      const r = await enroll.mutateAsync();
      setOtpAuth(r.otpauth_uri);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const confirmEnroll = async () => {
    try {
      await enableM.mutateAsync(code);
      notify.success('2FA включена');
      setOtpAuth(null);
      setCode('');
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const disable = async () => {
    try {
      await disableM.mutateAsync(pwd);
      notify.success('2FA отключена');
      setPwd('');
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-xl font-bold">
              Двухфакторная аутентификация
            </h2>
          </div>
          {user?.two_factor_enabled ? (
            <div className="space-y-4" data-testid="profile-2fa-enabled">
              <Alert>
                <CheckCircle2 />
                <AlertDescription>2FA включена</AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label htmlFor="profile-2fa-disable-password">
                  Пароль для отключения
                </Label>
                <Input
                  id="profile-2fa-disable-password"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.currentTarget.value)}
                  data-testid="profile-2fa-disable-password"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  onClick={disable}
                  disabled={disableM.isPending}
                  data-testid="profile-2fa-disable-submit"
                >
                  {disableM.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Отключить 2FA
                </Button>
              </div>
            </div>
          ) : !otpAuth ? (
            <div className="flex justify-end">
              <Button
                onClick={startEnroll}
                disabled={enroll.isPending}
                data-testid="profile-2fa-enroll-start"
              >
                {enroll.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Включить 2FA
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert data-testid="profile-2fa-qr">
                <AlertDescription>
                  Отсканируйте QR-код или используйте URI:
                  <p
                    className="mt-1 font-mono text-xs break-all"
                    data-testid="profile-2fa-otpauth-uri"
                  >
                    {otpAuth}
                  </p>
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Код из приложения"
                  value={code}
                  onChange={(e) => setCode(e.currentTarget.value)}
                  className="flex-1"
                  data-testid="profile-2fa-code-input"
                />
                <Button
                  onClick={confirmEnroll}
                  disabled={enableM.isPending}
                  data-testid="profile-2fa-confirm-enroll"
                >
                  {enableM.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Подтвердить
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OAuthCard() {
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const unlink = useUnlinkOAuth();
  const [loading, setLoading] = useState<OAuthProvider | null>(null);

  const handleUnlink = async (p: OAuthProvider) => {
    setLoading(p);
    try {
      await unlink.mutateAsync(p);
      notify.success(`Отвязано: ${p}`);
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setLoading(null);
    }
  };

  const handleLink = (p: OAuthProvider) => {
    window.location.href = `/api/v1/auth/oauth/${p}/authorize?return_url=${encodeURIComponent(
      window.location.href,
    )}`;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <h2 className="text-xl font-bold">OAuth identities</h2>
          <OAuthLinksList
            linked={(user?.linked_oauth as OAuthProvider[]) ?? []}
            loadingProvider={loading}
            onLink={handleLink}
            onUnlink={handleUnlink}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const notify = useNotifications();
  const sessionsQ = useMySessions();
  const revoke = useRevokeSession();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleRevoke = async (id: string) => {
    setLoadingId(id);
    try {
      await revoke.mutateAsync(id);
      notify.success('Сессия завершена');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Активные сессии</h2>
          {sessionsQ.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SessionsTable
              sessions={sessionsQ.data ?? []}
              onRevoke={handleRevoke}
              loadingId={loadingId}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const VALID_TABS = ['password', '2fa', 'oauth', 'sessions'] as const;
type SecurityTab = (typeof VALID_TABS)[number];

export function SecurityPage() {
  useDocumentTitle('Безопасность');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: SecurityTab = (VALID_TABS as readonly string[]).includes(
    requestedTab ?? '',
  )
    ? (requestedTab as SecurityTab)
    : 'password';

  const onTabChange = (value: string) => {
    if (!value) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Page>
      <Breadcrumbs />
      <PageHeader title="Безопасность" />
      <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="2fa">2FA</TabsTrigger>
            <TabsTrigger value="oauth">OAuth</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>
          <TabsContent value="password" className="pt-4">
            <PasswordChangeCard />
          </TabsContent>
          <TabsContent value="2fa" className="pt-4">
            <TwoFactorCard />
          </TabsContent>
          <TabsContent value="oauth" className="pt-4">
            <OAuthCard />
          </TabsContent>
          <TabsContent value="sessions" className="pt-4">
            <SessionsCard />
          </TabsContent>
      </Tabs>
    </Page>
  );
}

export default SecurityPage;
