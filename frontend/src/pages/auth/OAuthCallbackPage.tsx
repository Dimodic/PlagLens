/**
 * /auth/oauth/callback — handles redirects back from /auth/oauth/{provider}/callback.
 *
 * The backend completes the OAuth dance and redirects here with either:
 *   - ?login=success → we just call /auth/refresh to get the access token, then go to /
 *   - ?error=...     → display an error
 *   - ?return_url=...→ honour custom destination
 *
 * Visually: a minimal full-screen splash with the brand mark + a status line.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function OAuthCallbackPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.oauth.completing'));
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (error) {
      setProblem({
        title: t('auth.oauth.failed'),
        status: 400,
        code: error.toUpperCase(),
        detail: errorDescription ?? undefined,
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await refresh();
      if (cancelled) return;
      if (ok) {
        const next = params.get('return_url') ?? '/';
        navigate(next, { replace: true });
      } else {
        setProblem({
          title: t('auth.oauth.no_session.title'),
          status: 401,
          code: 'NO_SESSION',
          detail: t('auth.oauth.no_session.body'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, refresh, navigate, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <span className="text-base font-semibold">P</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('auth.oauth.completing')}
          </h1>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            {!problem ? (
              <div
                data-testid="oauth-callback-loading"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('auth.oauth.wait')}
              </div>
            ) : (
              <>
                <Alert variant="destructive" data-testid="problem-alert">
                  <AlertTitle>{problem.title}</AlertTitle>
                  {problem.detail && (
                    <AlertDescription>{problem.detail}</AlertDescription>
                  )}
                  {problem.code && (
                    <AlertDescription className="font-mono text-xs">
                      {problem.code}
                    </AlertDescription>
                  )}
                </Alert>
                <Button variant="outline" className="w-full" asChild>
                  <Link to="/login">{t('auth.verify.token_missing.cta')}</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default OAuthCallbackPage;
