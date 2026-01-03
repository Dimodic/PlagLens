/**
 * /me/2fa — TOTP enrollment flow for an already-logged user.
 *
 * Two-step:
 *   1. POST /auth/2fa/enroll → secret + otpauth_uri (display QR)
 *   2. User enters TOTP code → POST /auth/2fa/enable → backup codes shown once
 */
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EnrollData {
  secret: string;
  otpauth_uri: string;
  qr_svg?: string;
}

export function TwoFactorEnrollPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.twofa.title'));

  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .twoFactorEnroll()
      .then((data) => {
        if (!cancelled) setEnroll(data);
      })
      .catch((p) => {
        if (!cancelled) setProblem(p as Problem);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    if (!/^\d{6}$/.test(totpCode)) {
      setTotpError('Введите 6 цифр');
      return;
    }
    setTotpError(null);
    setSubmitting(true);
    try {
      const r = await authApi.twoFactorEnable(totpCode);
      setBackupCodes(r.backup_codes);
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  if (backupCodes) {
    return (
      <Shell
        heading={t('auth.twofa.success.title')}
        sub={t('auth.twofa.success.body')}
      >
        <div data-testid="twofa-backup-codes" className="space-y-4">
          <div className="rounded-md border bg-muted p-4">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
              {backupCodes.map((c) => (
                <div key={c} className="text-foreground">
                  {c}
                </div>
              ))}
            </div>
          </div>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/me">{t('auth.twofa.success.cta')}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell heading={t('auth.twofa.title')} sub={t('auth.twofa.sub')}>
      <div className="space-y-4">
        {problem && (
          <Alert variant="destructive" data-testid="problem-alert">
            <AlertTitle>{problem.title}</AlertTitle>
            {problem.detail && (
              <AlertDescription>{problem.detail}</AlertDescription>
            )}
          </Alert>
        )}

        {enroll ? (
          <>
            {enroll.qr_svg && (
              <div
                aria-label="QR"
                data-testid="twofa-qr"
                className="mx-auto w-fit rounded-md border bg-white p-2"
                dangerouslySetInnerHTML={{ __html: enroll.qr_svg }}
              />
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('auth.twofa.secret_hint')}{' '}
              <code
                data-testid="twofa-secret"
                className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
              >
                {enroll.secret}
              </code>
            </p>
            <form onSubmit={handleEnable} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="twofa-totp-input">
                  {t('auth.twofa.code_label')}
                </Label>
                <Input
                  id="twofa-totp-input"
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  data-testid="twofa-totp-input"
                  aria-invalid={!!totpError}
                />
                {totpError && (
                  <p role="alert" className="text-xs text-destructive">
                    {totpError}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="twofa-enable-submit"
                className="w-full"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.twofa.submit')}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        )}
      </div>
    </Shell>
  );
}

interface ShellProps {
  heading: string;
  sub: string;
  children: React.ReactNode;
}

function Shell({ heading, children }: ShellProps) {
  // Rendered inside AppShell — no full-screen wrapper, no duplicate logo.
  // sub-text intentionally dropped (design-system: "tool, not tour-guide").
  return (
    <Page width="narrow">
      <PageHeader title={heading} />
      {children}
    </Page>
  );
}

export default TwoFactorEnrollPage;
