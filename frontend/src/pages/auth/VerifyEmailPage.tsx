/**
 * /auth/verify?t=… — confirms email by token.
 *
 * Flat states (no boxes): verifying / ok / error / token-missing. The heading
 * carries the result, a plain sub-line gives context, one button below —
 * matching the login screen's chrome-free style.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/shell/BrandMark';

type State = 'idle' | 'verifying' | 'ok' | 'error';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.verify.title'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Email links use `?t=` (build_frontend_url); accept `?token=` too as a fallback.
  const token = params.get('t') ?? params.get('token') ?? '';

  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setState('verifying');
    authApi
      .emailVerifyConfirm(token)
      .then(() => {
        if (!cancelled) setState('ok');
      })
      .catch(() => {
        if (!cancelled) setState('error');
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

  const heading =
    state === 'ok'
      ? t('auth.verify.ok_title')
      : state === 'error'
        ? t('auth.verify.error_title')
        : t('auth.verify.heading');
  const sub =
    state === 'verifying'
      ? t('auth.verify.checking')
      : state === 'ok'
        ? t('auth.verify.ok_body')
        : state === 'error'
          ? t('auth.verify.error_body')
          : '';

  return (
    <Shell heading={heading} sub={sub}>
      {state === 'verifying' && (
        <div className="flex justify-center" data-testid="verify-state-verifying">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === 'ok' && (
        <Button
          type="button"
          className="w-full"
          onClick={() => navigate('/login')}
          data-testid="verify-state-ok"
        >
          {t('auth.verify.cta')}
        </Button>
      )}
      {state === 'error' && (
        <Button
          variant="outline"
          className="w-full"
          asChild
          data-testid="verify-state-error"
        >
          <Link to="/login">{t('auth.verify.token_missing.cta')}</Link>
        </Button>
      )}
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
          <BrandMark cropped className="h-14 w-14" title="PlagLens" />
          <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
