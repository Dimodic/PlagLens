/**
 * LoginPage — entry point for credential + OAuth sign-in.
 *
 * Design notes per .claude/UI_RULES.md:
 *   - No card chrome. One narrow column on a flat background.
 *   - OAuth row first (icons only — Google / Яндекс / Telegram / GitHub),
 *     then the email/password form. The icon row reads as the "fast path"
 *     and the form as the fallback.
 *   - All OAuth glyphs are monochrome (use currentColor) so the row feels
 *     like a single element of the page, not a brand carnival.
 *   - Telegram is rendered but inactive — clicking it surfaces a toast
 *     until the backend Telegram Login Widget integration ships.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { tokenStore } from '@/api/client';
import { startOAuth, OAUTH_PROVIDERS } from '@/api/endpoints/oauth';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import type { OAuthProvider, Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Monochrome brand glyphs — outlined where possible, filled with currentColor
// otherwise. The same row reads cleanly on light and dark themes because the
// only colour is the theme's text-foreground.
function OAuthGlyph({ provider }: { provider: OAuthProvider }) {
  const common = { className: 'h-5 w-5', 'aria-hidden': true, fill: 'currentColor' as const };
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M21.35 11.1H12v3.8h5.36c-.5 2.4-2.55 3.7-5.36 3.7-3.25 0-5.88-2.65-5.88-5.9s2.63-5.9 5.88-5.9c1.42 0 2.7.5 3.71 1.45l2.78-2.78C16.96 3.97 14.65 3 12 3 7 3 2.95 7.05 2.95 12S7 21 12 21c5.18 0 9.5-3.65 9.5-9 0-.6-.06-1.18-.15-1.9z" />
      </svg>
    );
  }
  if (provider === 'yandex') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M13.78 5h-1.1c-2.13 0-3.4 1.15-3.4 2.86 0 1.9.84 2.85 2.54 4l1.36.94L8.92 19h2.06l3.95-6.46V5h-1.15zm-.04 1.5v5.4l-.95-.7c-1.18-.85-1.61-1.43-1.61-2.66 0-1.16.6-2.04 1.66-2.04h.9z" />
      </svg>
    );
  }
  if (provider === 'telegram') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M21.5 4.2 18.2 19.5c-.25 1.1-.9 1.36-1.82.85l-5-3.7-2.41 2.32c-.27.27-.5.5-1 .5l.36-5.05L18.5 6.13c.4-.36-.09-.55-.62-.2L7.5 12.5l-4.86-1.52c-1.05-.33-1.07-1.05.22-1.55l19-7.32c.88-.32 1.65.2 1.64 1.59z" />
      </svg>
    );
  }
  if (provider === 'github') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 015.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
      </svg>
    );
  }
  return null;
}

export function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.login.title'));

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { login, reloadMe } = useAuth();
  const notify = useNotifications();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const [problem, setProblem] = useState<Problem | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get('error');
    if (err !== 'oauth_email_exists') return;
    const providerName = params.get('provider') ?? 'этот провайдер';
    const providerLabel: Record<string, string> = {
      google: 'Google',
      yandex: 'Яндекс',
      stepik: 'Stepik',
      github: 'GitHub',
      telegram: 'Telegram',
    };
    const niceProvider = providerLabel[providerName] ?? providerName;
    const emailFromQuery = params.get('email');
    if (emailFromQuery) setEmail(emailFromQuery);
    setHint(
      `Аккаунт с этим email уже существует, но к нему не привязан ${niceProvider}. ` +
        `Войдите паролем, затем привяжите ${niceProvider} в разделе «Профиль → Безопасность».`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = () => {
    const next = params.get('next');
    navigate(next ? decodeURIComponent(next) : '/', { replace: true });
  };

  const validate = (): boolean => {
    let ok = true;
    if (!/^.+@.+\..+$/.test(email)) {
      setEmailError('Некорректный email'); ok = false;
    } else { setEmailError(null); }
    if (password.length < 1) {
      setPasswordError('Введите пароль'); ok = false;
    } else { setPasswordError(null); }
    if (mfaToken && !/^\d{6}$/.test(totpCode)) {
      setTotpError('Введите 6 цифр'); ok = false;
    } else { setTotpError(null); }
    return ok;
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!validate()) return;
    setProblem(null);
    setSubmitting(true);
    try {
      if (mfaToken && mfaToken !== 'mfa-required') {
        const resp = await authApi.twoFactorVerify(mfaToken, totpCode);
        await queryClient.cancelQueries();
        queryClient.clear();
        tokenStore.set(resp.access_token);
        await reloadMe();
        goNext();
        return;
      }
      const result = await login({
        email, password,
        totp_code: totpCode || undefined,
      });
      if (result.requiresMfa) {
        setMfaToken(result.mfaToken ?? 'mfa-required');
        setProblem(null);
        return;
      }
      goNext();
    } catch (raw) {
      const p = raw as Problem & { mfa_token?: string };
      if (p?.code === 'TWO_FACTOR_REQUIRED') {
        setMfaToken(p.mfa_token ?? 'mfa-required');
        setProblem(null);
      } else {
        setProblem(p);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const credentialsValid = useMemo(
    () => /^.+@.+\..+$/.test(email) && password.length > 0,
    [email, password],
  );

  const inlineErrorMessage = problem
    ? problem.code === 'INVALID_CREDENTIALS'
      ? 'Неверный email или пароль'
      : problem.detail || problem.title || 'Не удалось войти'
    : null;

  // Display row: same order as OAUTH_PROVIDERS + Telegram appended as a
  // disabled "coming soon" placeholder. When the Telegram backend ships,
  // adding 'telegram' to OAUTH_PROVIDERS in /api/endpoints/oauth.ts will
  // upgrade it to a normal active button.
  const providerRow: { id: OAuthProvider; label: string; disabled?: boolean }[] = [
    ...OAUTH_PROVIDERS,
    { id: 'telegram' as OAuthProvider, label: 'Telegram', disabled: true },
  ];

  return (
    <div
      data-testid="login-page"
      className="flex min-h-screen items-center justify-center bg-background px-6 py-12"
    >
      <main className="w-full max-w-sm space-y-10">
        {/* Brand */}
        <header className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-2xl bg-foreground text-background text-2xl font-semibold tracking-tight"
          >
            P
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              PlagLens
            </h1>
            <p className="text-sm text-muted-foreground">
              Войдите, чтобы продолжить
            </p>
          </div>
        </header>

        {/* OAuth row — round monochrome icons, top of the page as the
            "fast path" before the email/password form. */}
        <section className="space-y-4">
          <div className="flex justify-center gap-3">
            {providerRow.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Войти через ${p.label}`}
                title={p.label}
                data-testid={`login-oauth-${p.id}`}
                disabled={p.disabled}
                onClick={() => {
                  if (p.disabled) {
                    notify.info(`Вход через ${p.label} скоро будет доступен`);
                    return;
                  }
                  const next = params.get('next');
                  startOAuth(
                    p.id,
                    next
                      ? decodeURIComponent(next)
                      : window.location.origin + '/',
                  );
                }}
                className={
                  'flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                  (p.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:border-foreground hover:bg-foreground hover:text-background')
                }
              >
                <OAuthGlyph provider={p.id} />
              </button>
            ))}
          </div>
          <div className="relative flex items-center">
            <span className="flex-1 border-t border-border" aria-hidden />
            <span className="px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              или по почте
            </span>
            <span className="flex-1 border-t border-border" aria-hidden />
          </div>
        </section>

        {/* Email / password form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="login-form">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="you@hse.ru"
              autoComplete="email"
              data-testid="login-email"
              className="h-11"
            />
            {emailError && (
              <p role="alert" className="text-xs text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="login-password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Пароль
              </Label>
              <Link
                to="/auth/password-reset"
                data-testid="login-forgot-link"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Забыли пароль?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              data-testid="login-password"
              className="h-11"
            />
            {passwordError && (
              <p role="alert" className="text-xs text-destructive">
                {passwordError}
              </p>
            )}
          </div>

          {mfaToken && (
            <div className="space-y-1.5">
              <Label htmlFor="login-totp" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Код 2FA
              </Label>
              <Input
                id="login-totp"
                value={totpCode}
                onChange={(e) => setTotpCode(e.currentTarget.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                data-testid="login-totp"
                className="h-11 tracking-widest text-center"
              />
              {totpError && (
                <p role="alert" className="text-xs text-destructive">
                  {totpError}
                </p>
              )}
            </div>
          )}

          {hint && !inlineErrorMessage && (
            <Alert data-testid="login-hint">
              <AlertDescription>{hint}</AlertDescription>
            </Alert>
          )}

          {(problem || inlineErrorMessage) && (
            <Alert variant="destructive" data-testid="problem-alert">
              <AlertDescription>{inlineErrorMessage}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={submitting || (!mfaToken && !credentialsValid)}
            data-testid="login-submit"
            className="w-full h-11 text-sm font-medium"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mfaToken ? 'Подтвердить' : 'Войти'}
          </Button>
        </form>

        <div className="text-center text-xs text-muted-foreground">
          Нет аккаунта?{' '}
          <Link
            to="/register"
            data-testid="login-register-link"
            className="font-medium text-foreground hover:underline"
          >
            Зарегистрируйтесь
          </Link>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
