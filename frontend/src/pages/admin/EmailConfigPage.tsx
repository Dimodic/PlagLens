/**
 * /admin/notifications/email — admin-driven SMTP / Mailgun configuration.
 *
 * The form drives the same DB row the notification-service reads when
 * dispatching transactional mail (register-verify, password-reset,
 * invitations). Saving a row hot-reloads the runtime channel — no
 * container restart, no SSH.
 *
 * Secrets (SMTP password, Mailgun API key) are write-only: GET never
 * returns them in plaintext, just a boolean ``*_set`` flag. Leaving the
 * password field empty on save preserves the stored secret; submitting
 * any non-empty value replaces it (Fernet-encrypted server-side).
 *
 * Layout — same minimalism as the OAuth / Integrations pages:
 *   • one narrow column, no card chrome
 *   • provider segmented switch at the top
 *   • body switches to the matching transport form
 *   • bottom row: «Тест отправки» (sends to the admin's own email) +
 *     «Сохранить»
 */
import { FormEvent, useEffect, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useEmailConfig,
  useTestEmail,
  useUpdateEmailConfig,
} from '@/hooks/api/useNotificationsAdmin';
import { useAuth } from '@/auth/useAuth';
import type {
  EmailConfigPatch,
  EmailProvider,
} from '@/api/endpoints/notificationsAdmin';
import type { Problem } from '@/api/types';
import { cn } from '@/components/ui/utils';

// SMTP modes — backend stores them as two booleans (smtp_use_tls,
// smtp_use_starttls) but for a sane UI we collapse to a single enum
// because they're mutually exclusive in practice.
type SmtpMode = 'ssl' | 'starttls' | 'plain';

function modeToBooleans(m: SmtpMode): { use_tls: boolean; use_starttls: boolean } {
  if (m === 'ssl') return { use_tls: true, use_starttls: false };
  if (m === 'starttls') return { use_tls: false, use_starttls: true };
  return { use_tls: false, use_starttls: false };
}

function booleansToMode(use_tls: boolean, use_starttls: boolean): SmtpMode {
  if (use_tls) return 'ssl';
  if (use_starttls) return 'starttls';
  return 'plain';
}

export function EmailConfigPage() {
  useDocumentTitle('Настройка почты');
  const { user } = useAuth();
  const notify = useNotifications();
  const cfgQ = useEmailConfig();
  const update = useUpdateEmailConfig();
  const testM = useTestEmail();

  const [provider, setProvider] = useState<EmailProvider>('smtp');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('PlagLens');
  const [replyTo, setReplyTo] = useState('');

  // SMTP
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<number>(465);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState(''); // write-only
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpMode, setSmtpMode] = useState<SmtpMode>('ssl');

  // Mailgun
  const [mailgunDomain, setMailgunDomain] = useState('');
  const [mailgunApiKey, setMailgunApiKey] = useState(''); // write-only
  const [mailgunApiKeySet, setMailgunApiKeySet] = useState(false);
  const [mailgunRegion, setMailgunRegion] = useState<'us' | 'eu'>('eu');

  const [problem, setProblem] = useState<Problem | null>(null);

  // When the GET arrives, sync form state with server values. The
  // secrets stay empty (they're not returned) — only the *_set flags
  // populate, used to render the «••••» placeholder.
  useEffect(() => {
    const c = cfgQ.data;
    if (!c) return;
    setProvider(c.provider);
    setFromEmail(c.from_email ?? '');
    setFromName(c.from_name ?? 'PlagLens');
    setReplyTo(c.reply_to ?? '');
    setSmtpHost(c.smtp_host ?? '');
    setSmtpPort(c.smtp_port ?? 465);
    setSmtpUsername(c.smtp_username ?? '');
    setSmtpPasswordSet(!!c.smtp_password_set);
    setSmtpMode(booleansToMode(!!c.smtp_use_tls, c.smtp_use_starttls ?? true));
    setMailgunDomain(c.mailgun_domain ?? '');
    setMailgunApiKeySet(!!c.mailgun_api_key_set);
    setMailgunRegion((c.mailgun_region as 'us' | 'eu') ?? 'eu');
  }, [cfgQ.data]);

  const onSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    const modeBools = modeToBooleans(smtpMode);
    const body: EmailConfigPatch = {
      provider,
      from_email: fromEmail.trim() || undefined,
      from_name: fromName.trim() || undefined,
      reply_to: replyTo.trim() || null,
    };
    if (provider === 'smtp') {
      body.smtp_host = smtpHost.trim() || null;
      body.smtp_port = smtpPort || null;
      body.smtp_username = smtpUsername.trim() || null;
      body.smtp_use_tls = modeBools.use_tls;
      body.smtp_use_starttls = modeBools.use_starttls;
      // Only send password when the admin typed something — otherwise the
      // backend preserves the existing stored secret.
      if (smtpPassword) body.smtp_password = smtpPassword;
    } else {
      body.mailgun_domain = mailgunDomain.trim() || null;
      body.mailgun_region = mailgunRegion;
      if (mailgunApiKey) body.mailgun_api_key = mailgunApiKey;
    }
    try {
      await update.mutateAsync(body);
      notify.success('Сохранено');
      setSmtpPassword('');
      setMailgunApiKey('');
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  const onTest = async () => {
    if (!user?.email) {
      notify.error('У вашего аккаунта не задан email — некуда отправить тест');
      return;
    }
    setProblem(null);
    try {
      const res = await testM.mutateAsync(user.email);
      if (res.status === 'sent') {
        notify.success(`Тестовое письмо отправлено на ${user.email}`);
      } else {
        notify.error(
          `Не доставлено (${res.status})${res.error ? `: ${res.error}` : ''}`,
        );
      }
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  const providerTab = (id: EmailProvider, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setProvider(id)}
      className={cn(
        'flex-1 rounded-md px-4 py-2 text-sm transition-colors',
        provider === id
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
      data-testid={`email-provider-${id}`}
      aria-pressed={provider === id}
    >
      {label}
    </button>
  );

  return (
    <Page width="regular">
      <PageHeader title="Настройка почты" />

      {cfgQ.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-6" noValidate>
          {problem && (
            <Alert variant="destructive" data-testid="email-config-error">
              <AlertTitle>{problem.title || 'Не удалось'}</AlertTitle>
              {problem.detail && <AlertDescription>{problem.detail}</AlertDescription>}
            </Alert>
          )}

          {/* Provider switch — two-button segmented control. */}
          <div className="flex gap-1 rounded-md bg-muted/20 p-1">
            {providerTab('smtp', 'SMTP')}
            {providerTab('mailgun', 'Mailgun')}
          </div>

          {/* From-address block — shared by both providers. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-from-email">Адрес отправителя</Label>
              <Input
                id="email-from-email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.currentTarget.value)}
                placeholder="no-reply@plaglens.ru"
                data-testid="email-from-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-from-name">Имя отправителя</Label>
              <Input
                id="email-from-name"
                value={fromName}
                onChange={(e) => setFromName(e.currentTarget.value)}
                data-testid="email-from-name-input"
              />
            </div>
          </div>

          {provider === 'smtp' && (
            <div className="space-y-4 border-t border-border/40 pt-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-host">SMTP-сервер</Label>
                  <Input
                    id="smtp-host"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.currentTarget.value)}
                    placeholder="smtp.yandex.ru"
                    autoComplete="off"
                    data-testid="smtp-host-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">Порт</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.currentTarget.value) || 0)}
                    data-testid="smtp-port-input"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-mode">Режим шифрования</Label>
                <Select
                  value={smtpMode}
                  onValueChange={(v) => setSmtpMode((v as SmtpMode) ?? 'ssl')}
                >
                  <SelectTrigger id="smtp-mode" data-testid="smtp-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssl">SSL (порт 465 — Yandex, Gmail)</SelectItem>
                    <SelectItem value="starttls">STARTTLS (порт 587)</SelectItem>
                    <SelectItem value="plain">Без шифрования (порт 25 — dev)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-username">Логин</Label>
                <Input
                  id="smtp-username"
                  value={smtpUsername}
                  onChange={(e) => setSmtpUsername(e.currentTarget.value)}
                  autoComplete="off"
                  placeholder="user@yandex.ru"
                  data-testid="smtp-username-input"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-password">
                  Пароль
                  {smtpPasswordSet && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (введите заново для замены)
                    </span>
                  )}
                </Label>
                <Input
                  id="smtp-password"
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.currentTarget.value)}
                  autoComplete="new-password"
                  placeholder={smtpPasswordSet ? '••••••••' : ''}
                  data-testid="smtp-password-input"
                />
                <p className="text-xs text-muted-foreground">
                  Для Yandex используйте «пароль приложения» из{' '}
                  <a
                    href="https://id.yandex.ru/security/app-passwords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:underline"
                  >
                    id.yandex.ru → Пароли приложений
                  </a>
                  , а не основной пароль аккаунта.
                </p>
              </div>
            </div>
          )}

          {provider === 'mailgun' && (
            <div className="space-y-4 border-t border-border/40 pt-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5">
                  <Label htmlFor="mailgun-domain">Домен</Label>
                  <Input
                    id="mailgun-domain"
                    value={mailgunDomain}
                    onChange={(e) => setMailgunDomain(e.currentTarget.value)}
                    placeholder="mg.plaglens.ru"
                    data-testid="mailgun-domain-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mailgun-region">Регион</Label>
                  <Select
                    value={mailgunRegion}
                    onValueChange={(v) =>
                      setMailgunRegion((v as 'us' | 'eu') ?? 'eu')
                    }
                  >
                    <SelectTrigger id="mailgun-region" data-testid="mailgun-region-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">US</SelectItem>
                      <SelectItem value="eu">EU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mailgun-api-key">
                  API-ключ
                  {mailgunApiKeySet && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (введите заново для замены)
                    </span>
                  )}
                </Label>
                <Input
                  id="mailgun-api-key"
                  type="password"
                  value={mailgunApiKey}
                  onChange={(e) => setMailgunApiKey(e.currentTarget.value)}
                  autoComplete="new-password"
                  placeholder={mailgunApiKeySet ? '••••••••' : ''}
                  data-testid="mailgun-api-key-input"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onTest}
              disabled={testM.isPending || !user?.email}
              data-testid="email-test-button"
            >
              {testM.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MailCheck className="mr-2 h-4 w-4" />
              )}
              Тест на свой email
            </Button>
            <Button
              type="submit"
              disabled={update.isPending}
              data-testid="email-save-button"
            >
              {update.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}

export default EmailConfigPage;
