/**
 * /auth/verify?token=… — confirms email by token.
 * Calls POST /auth/email/verify/confirm with the token.
 *
 * Three states: verifying, ok, error. token-missing renders a separate panel.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type State = 'idle' | 'verifying' | 'ok' | 'error';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.verify.title'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<State>('idle');
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setState('verifying');
    authApi
      .emailVerifyConfirm(token)
      .then(() => {
        if (!cancelled) setState('ok');
      })
      .catch((p) => {
        if (cancelled) return;
        setProblem(p as Problem);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <Shell
        heading={t('auth.verify.token_missing.title')}
        sub={t('auth.verify.token_missing.body')}
      >
        <Button variant="outline" className="w-full" asChild>
          <Link to="/login">{t('auth.verify.token_missing.cta')}</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      heading={t('auth.verify.heading')}
      sub={state === 'verifying' ? t('auth.verify.checking') : ''}
    >
      <div className="space-y-4">
        {state === 'verifying' && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('auth.verify.checking')}
          </div>
        )}
        {state === 'ok' && (
          <div data-testid="verify-state-ok" className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t('auth.verify.success')}</AlertDescription>
            </Alert>
            <Button
              type="button"
              className="w-full"
              onClick={() => navigate('/login')}
            >
              {t('auth.verify.cta')}
            </Button>
          </div>
        )}
        {state === 'error' && (
          <div data-testid="verify-state-error" className="space-y-4">
            {problem && (
              <Alert variant="destructive" data-testid="problem-alert">
                <AlertTitle>{problem.title}</AlertTitle>
                {problem.detail && (
                  <AlertDescription>{problem.detail}</AlertDescription>
                )}
              </Alert>
            )}
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">{t('auth.verify.token_missing.cta')}</Link>
            </Button>
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

function Shell({ heading, sub, children }: ShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <span className="text-base font-semibold">P</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>

        <Card>
          <CardContent className="p-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export default VerifyEmailPage;
