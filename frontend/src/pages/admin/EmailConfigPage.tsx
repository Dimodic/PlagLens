/**
 * /admin/notifications/email — «Почта» admin transport configuration.
 *
 * The form drives the same DB row the notification-service reads when
 * dispatching transactional mail (register-verify, password-reset,
 * invitations). Saving hot-reloads the runtime channel — no container
 * restart, no SSH.
 *
 * Layout — two top-level branches reflecting how mail providers actually
 * differ on the wire:
 *
 *   • SMTP — universal: Yandex, Gmail, Mail.ru, any custom mail server.
 *     One form covers all of them (host/port/mode/login/password).
 *   • API — HTTP-API services that don't speak SMTP. Inside this branch a
 *     secondary picker chooses Mailgun or Resend; the form below is the
 *     minimal one for the chosen vendor (no SMTP fields).
 *
 * Secrets (SMTP password, Mailgun API key, Resend API key) are write-only:
 * GET never returns them in plaintext, just a boolean ``*_set`` flag.
 * Leaving the password field empty on save preserves the stored secret;
 * submitting any non-empty value replaces it (Fernet-encrypted server-
 * side).
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
import { useTranslation } from '@/i18n';
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

const PROVIDER_LABELS: Record<EmailProvider, string> = {
  smtp: 'SMTP',
  mailgun: 'Mailgun · API',
  resend: 'Resend · API',
};

export function EmailConfigPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('email_config.title'));
  const { user } = useAuth();
  const notify = useNotifications();
  const cfgQ = useEmailConfig();
  const update = useUpdateEmailConfig();
  const testM = useTestEmail();

  // Single flat selector over all three transports. Earlier iteration
  // had a two-button «SMTP / API» segmented control + a vendor select,
  // which read as two big blobs at the top of the form — overkill for
  // three options.
  const [provider, setProvider] = useState<EmailProvider>('smtp');

  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('PlagLens');
  const [replyTo, setReplyTo] = useState('');

  // SMTP
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<number>(465);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpMode, setSmtpMode] = useState<SmtpMode>('ssl');

  // Mailgun
  const [mailgunDomain, setMailgunDomain] = useState('');
  const [mailgunApiKey, setMailgunApiKey] = useState('');
  const [mailgunApiKeySet, setMailgunApiKeySet] = useState(false);
  const [mailgunRegion, setMailgunRegion] = useState<'us' | 'eu'>('eu');

  // Resend
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendApiKeySet, setResendApiKeySet] = useState(false);

  const [problem, setProblem] = useState<Problem | null>(null);

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
    setResendApiKeySet(!!c.resend_api_key_set);
  }, [cfgQ.data]);

  const onSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    const body: EmailConfigPatch = {
      provider,
      from_email: fromEmail.trim() || undefined,
      from_name: fromName.trim() || undefined,
      reply_to: replyTo.trim() || null,
    };
    if (provider === 'smtp') {
      const m = modeToBooleans(smtpMode);
      body.smtp_host = smtpHost.trim() || null;
      body.smtp_port = smtpPort || null;
      body.smtp_username = smtpUsername.trim() || null;
      body.smtp_use_tls = m.use_tls;
      body.smtp_use_starttls = m.use_starttls;
      if (smtpPassword) body.smtp_password = smtpPassword;
    } else if (provider === 'mailgun') {
      body.mailgun_domain = mailgunDomain.trim() || null;
      body.mailgun_region = mailgunRegion;
      if (mailgunApiKey) body.mailgun_api_key = mailgunApiKey;
    } else if (provider === 'resend') {
      if (resendApiKey) body.resend_api_key = resendApiKey;
    }
    try {
      await update.mutateAsync(body);
      notify.success(t('email_config.saved'));
      setSmtpPassword('');
      setMailgunApiKey('');
      setResendApiKey('');
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  const onTest = async () => {
    if (!user?.email) {
      notify.error(t('email_config.test_no_email'));
      return;
    }
    setProblem(null);
    try {
      const res = await testM.mutateAsync(user.email);
      if (res.status === 'sent') {
        notify.success(t('email_config.test_sent', { email: user.email }));
      } else {
        notify.error(
          t('email_config.test_failed', {
            status: res.status,
            detail: res.error ? `: ${res.error}` : '',
          }),
        );
      }
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title={t('email_config.title')} />

      {cfgQ.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-5" noValidate>
          {problem && (
            <Alert variant="destructive" data-testid="email-config-error">
              <AlertTitle>{problem.title || t('email_config.error_title')}</AlertTitle>
              {problem.detail && <AlertDescription>{problem.detail}</AlertDescription>}
            </Alert>
          )}

          {/* Transport selector — flat list of all three options. The
              earlier two-step «SMTP / API» segmented control + vendor
              select was overkill for three choices and read as two big
              chrome blocks. One Select is enough. */}
          <div className="space-y-1.5">
            <Label htmlFor="email-provider">{t('email_config.transport')}</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider((v as EmailProvider) ?? 'smtp')}
            >
              <SelectTrigger id="email-provider" data-testid="email-provider-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smtp">{PROVIDER_LABELS.smtp}</SelectItem>
                <SelectItem value="mailgun">{PROVIDER_LABELS.mailgun}</SelectItem>
                <SelectItem value="resend">{PROVIDER_LABELS.resend}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* From-address block — shared across all providers. */}
          <div className="space-y-1.5">
            <Label htmlFor="email-from-email">{t('email_config.from_email')}</Label>
            <Input
              id="email-from-email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.currentTarget.value)}
              placeholder="no-reply@plaglens.ru"
              data-testid="email-from-email-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-from-name">{t('email_config.from_name')}</Label>
            <Input
              id="email-from-name"
              value={fromName}
              onChange={(e) => setFromName(e.currentTarget.value)}
              data-testid="email-from-name-input"
            />
          </div>

          {provider === 'smtp' && (
            <>
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-host">{t('email_config.smtp_host')}</Label>
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
                  <Label htmlFor="smtp-port">{t('email_config.smtp_port')}</Label>
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
                <Label htmlFor="smtp-mode">{t('email_config.smtp_mode')}</Label>
                <Select
                  value={smtpMode}
                  onValueChange={(v) => setSmtpMode((v as SmtpMode) ?? 'ssl')}
                >
                  <SelectTrigger id="smtp-mode" data-testid="smtp-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssl">{t('email_config.smtp_mode_ssl')}</SelectItem>
                    <SelectItem value="starttls">{t('email_config.smtp_mode_starttls')}</SelectItem>
                    <SelectItem value="plain">{t('email_config.smtp_mode_plain')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-username">{t('email_config.smtp_username')}</Label>
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
                  {t('email_config.smtp_password')}
                  {smtpPasswordSet && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('email_config.secret_replace_hint')}
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
                  {t('email_config.smtp_yandex_lead')}{' '}
                  <a
                    href="https://id.yandex.ru/security/app-passwords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:underline"
                  >
                    {t('email_config.smtp_yandex_link')}
                  </a>
                  {t('email_config.smtp_yandex_tail')}
                </p>
              </div>
            </>
          )}

          {provider === 'mailgun' && (
            <>
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mailgun-domain">{t('email_config.mailgun_domain')}</Label>
                  <Input
                    id="mailgun-domain"
                    value={mailgunDomain}
                    onChange={(e) => setMailgunDomain(e.currentTarget.value)}
                    placeholder="mg.plaglens.ru"
                    data-testid="mailgun-domain-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mailgun-region">{t('email_config.mailgun_region')}</Label>
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
                  {t('email_config.api_key')}
                  {mailgunApiKeySet && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('email_config.secret_replace_hint')}
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
            </>
          )}

          {provider === 'resend' && (
            <div className="space-y-1.5">
              <Label htmlFor="resend-api-key">
                {t('email_config.api_key')}
                {resendApiKeySet && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('email_config.secret_replace_hint')}
                  </span>
                )}
              </Label>
              <Input
                id="resend-api-key"
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.currentTarget.value)}
                autoComplete="new-password"
                placeholder={resendApiKeySet ? '••••••••' : 're_xxxxxxxxxx'}
                data-testid="resend-api-key-input"
              />
              <p className="text-xs text-muted-foreground">
                {t('email_config.resend_lead')}{' '}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  resend.com/api-keys
                </a>
                {t('email_config.resend_tail')}
              </p>
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
              {t('email_config.test_button')}
            </Button>
            <Button
              type="submit"
              disabled={update.isPending}
              data-testid="email-save-button"
            >
              {update.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}

export default EmailConfigPage;
