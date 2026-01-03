/**
 * /admin/notifications/email — email transport configuration + test.
 */
import { useEffect, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusPill } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDnsStatus,
  useEmailConfig,
  useTestEmail,
  useUpdateEmailConfig,
} from '@/hooks/api/useNotificationsAdmin';
import { useAuth } from '@/auth/useAuth';
import type { EmailTransport } from '@/api/endpoints/notificationsAdmin';
import type { Problem } from '@/api/types';

export function EmailConfigPage() {
  useDocumentTitle('Email config');
  const { user } = useAuth();
  const notify = useNotifications();
  const cfgQ = useEmailConfig();
  const dnsQ = useDnsStatus();
  const update = useUpdateEmailConfig();
  const testM = useTestEmail();

  const [transport, setTransport] = useState<EmailTransport>('smtp');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpTls, setSmtpTls] = useState(true);
  const [mailgunDomain, setMailgunDomain] = useState('');
  const [mailgunRegion, setMailgunRegion] = useState<'us' | 'eu'>('eu');
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (cfgQ.data) {
      setTransport(cfgQ.data.transport);
      setFromEmail(cfgQ.data.from_email);
      setFromName(cfgQ.data.from_name);
      setSmtpHost(cfgQ.data.smtp_host ?? '');
      setSmtpPort(cfgQ.data.smtp_port ?? 587);
      setSmtpUsername(cfgQ.data.smtp_username ?? '');
      setSmtpTls(cfgQ.data.smtp_use_tls ?? true);
      setMailgunDomain(cfgQ.data.mailgun_domain ?? '');
      setMailgunRegion((cfgQ.data.mailgun_region as 'us' | 'eu') ?? 'eu');
    }
  }, [cfgQ.data]);

  const handleSave = async () => {
    setProblem(null);
    try {
      await update.mutateAsync({
        transport,
        from_email: fromEmail,
        from_name: fromName,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_username: smtpUsername,
        smtp_use_tls: smtpTls,
        mailgun_domain: mailgunDomain,
        mailgun_region: mailgunRegion,
      });
      notify.success('Сохранено');
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  const handleTest = async () => {
    if (!user?.email) return;
    try {
      await testM.mutateAsync(user.email);
      notify.success(`Тестовое письмо отправлено на ${user.email}`);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось отправить');
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title="Email-конфиг" />

      {problem && <ProblemAlert problem={problem} />}

      {cfgQ.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-transport">Transport</Label>
              <Select
                value={transport}
                onValueChange={(v) => setTransport((v as EmailTransport) ?? 'smtp')}
              >
                <SelectTrigger id="email-transport" data-testid="email-transport-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp">SMTP</SelectItem>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-from-email">from_email *</Label>
              <Input
                id="email-from-email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.currentTarget.value)}
                data-testid="email-from-email-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-from-name">from_name</Label>
              <Input
                id="email-from-name"
                value={fromName}
                onChange={(e) => setFromName(e.currentTarget.value)}
                data-testid="email-from-name-input"
              />
            </div>

            {transport === 'smtp' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-host">smtp_host</Label>
                  <Input
                    id="smtp-host"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.currentTarget.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">smtp_port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.currentTarget.value) || 587)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-username">smtp_username</Label>
                  <Input
                    id="smtp-username"
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.currentTarget.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="smtp-tls"
                    checked={smtpTls}
                    onCheckedChange={(v) => setSmtpTls(v)}
                  />
                  <Label htmlFor="smtp-tls">Use TLS</Label>
                </div>
              </>
            )}

            {transport === 'mailgun' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mailgun-domain">mailgun_domain</Label>
                  <Input
                    id="mailgun-domain"
                    value={mailgunDomain}
                    onChange={(e) => setMailgunDomain(e.currentTarget.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mailgun-region">region</Label>
                  <Select
                    value={mailgunRegion}
                    onValueChange={(v) => setMailgunRegion((v as 'us' | 'eu') ?? 'eu')}
                  >
                    <SelectTrigger id="mailgun-region">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">US</SelectItem>
                      <SelectItem value="eu">EU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dnsQ.data && (
                  <div className="flex items-center gap-2">
                    <StatusPill tone={dnsQ.data.spf_ok ? 'success' : 'destructive'}>
                      SPF: {dnsQ.data.spf_ok ? 'OK' : 'FAIL'}
                    </StatusPill>
                    <StatusPill tone={dnsQ.data.dkim_ok ? 'success' : 'destructive'}>
                      DKIM: {dnsQ.data.dkim_ok ? 'OK' : 'FAIL'}
                    </StatusPill>
                    <StatusPill tone={dnsQ.data.dmarc_ok ? 'success' : 'destructive'}>
                      DMARC: {dnsQ.data.dmarc_ok ? 'OK' : 'FAIL'}
                    </StatusPill>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={handleTest}
                disabled={testM.isPending}
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
                onClick={handleSave}
                disabled={update.isPending}
                data-testid="email-save-button"
              >
                {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Сохранить
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

export default EmailConfigPage;
