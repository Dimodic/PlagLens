/**
 * LoginPage — entry point for credential + OAuth sign-in.
 *
 * The previous version wrapped the form in a `<Card>` which made the
 * whole screen read as a tiny boxed widget floating in a black void
 * (user feedback: "устаревше, мелко и некрасиво"). This redesign drops
 * the card chrome entirely, widens the column to ~28rem, bumps input
 * heights, and gives the OAuth row real visual presence with a
 * separator line above it. Same document-style minimalism the rest of
 * the app uses.
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
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.login.title'));

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { login, reloadMe } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const [problem, setProblem] = useState<Problem | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Informational message (e.g. ?error=oauth_email_exists) — shown above the
  // form, NOT a destructive alert, because it explains a next step rather
  // than reporting a failure.
  const [hint, setHint] = useState<string | null>(null);

  // Translate query-string errors coming from the OAuth callback into a
  // readable hint and prefill the email field so the user only has to type
  // their password.
  useEffect(() => {
    const err = params.get('error');
    if (err !== 'oauth_email_exists') return;
    const providerName = params.get('provider') ?? 'этот провайдер';
    const providerLabel: Record<string, string> = {
      google: 'Google',
      yandex: 'Яндекс',
      stepik: 'Stepik',
      github: 'GitHub',
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

  return (
    <div
      data-testid="login-page"
      className="flex min-h-screen items-center justify-center bg-background px-6 py-12"
    >
      <div className="w-full max-w-md space-y-10">
        {/* Brand block — bigger logo + wordmark + a quiet greeting.
            No card around it; the page itself is the surface. */}
        <header className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground text-xl font-semibold"
          >
            P
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            PlagLens
          </h1>
          <p className="text-sm text-muted-foreground">
            Войдите, чтобы продолжить
          </p>
        </header>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="login-email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hse.ru"
              autoComplete="email"
              autoFocus
              disabled={!!mfaToken}
              data-testid="login-email"
              aria-invalid={!!emailError}
              className="h-11"
            />
            {emailError && (
              <p role="alert" className="text-xs text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="login-password" className="text-sm font-medium">
                Пароль
              </Label>
              <Link
                to="/auth/forgot"
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
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={!!mfaToken}
              data-testid="login-password"
              aria-invalid={!!passwordError}
              className="h-11"
            />
            {passwordError && (
              <p role="alert" className="text-xs text-destructive">
                {passwordError}
              </p>
            )}
          </div>

          {mfaToken && (
            <div className="space-y-2">
              <Label htmlFor="login-totp-code" className="text-sm font-medium">
                Код 2FA
              </Label>
              <Input
                id="login-totp-code"
                type="text"
                inputMode="numeric"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                autoFocus
                data-testid="login-totp-code"
                aria-invalid={!!totpError}
                className="h-11"
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

        {/* OAuth row — separator line with text label inside, then a
            4-up grid of outline buttons. Buttons are same height as
            the inputs above so the page feels balanced. */}
        <div className="space-y-4">
          <div className="relative flex items-center">
            <span className="flex-1 border-t border-border" aria-hidden />
            <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">
              или войти через
            </span>
            <span className="flex-1 border-t border-border" aria-hidden />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OAUTH_PROVIDERS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                data-testid={`login-oauth-${p.id}`}
                onClick={() => {
                  const next = params.get('next');
                  startOAuth(
                    p.id,
                    next
                      ? decodeURIComponent(next)
                      : window.location.origin + '/',
                  );
                }}
                className="h-10"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Footer links — just the signup CTA. The Demo-вход link
            existed for the dev environment and has no place in prod;
            «Забыли пароль?» moved up next to the password input where
            it actually belongs. */}
        <div className="flex justify-center text-xs text-muted-foreground">
          <Link
            to="/register"
            data-testid="login-register-link"
            className="hover:text-foreground transition-colors"
          >
            Создать аккаунт
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
