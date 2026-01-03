/**
 * /auth/forgot — single centered card. Asks for an e-mail (and optional
 * tenant slug) and triggers POST /auth/password/forgot.
 *
 * The success panel never reveals whether the email exists — the backend
 * deliberately responds 204 either way.
 */
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.forgot.title'));

  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    if (!/^.+@.+\..+$/.test(email)) {
      setEmailError('Некорректный email');
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      await authApi.passwordForgot(email, tenantSlug || undefined);
      setDone(true);
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <span className="text-base font-semibold">P</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('auth.forgot.heading')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('auth.forgot.sub')}
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            {done ? (
              <div data-testid="forgot-success" className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{t('auth.forgot.success')}</AlertDescription>
                </Alert>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {problem && (
                  <Alert variant="destructive" data-testid="problem-alert">
                    <AlertTitle>{problem.title}</AlertTitle>
                    {problem.detail && (
                      <AlertDescription>{problem.detail}</AlertDescription>
                    )}
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">
                    {t('auth.forgot.email_label')}
                  </Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    placeholder="you@hse.ru"
                    data-testid="forgot-email"
                    aria-invalid={!!emailError}
                  />
                  {emailError && (
                    <p role="alert" className="text-xs text-destructive">
                      {emailError}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="forgot-tenant-slug">
                    {t('auth.forgot.tenant_label')}
                  </Label>
                  <Input
                    id="forgot-tenant-slug"
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="hse"
                    data-testid="forgot-tenant-slug"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="forgot-submit"
                  className="w-full"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('auth.forgot.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            {t('auth.forgot.back')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
