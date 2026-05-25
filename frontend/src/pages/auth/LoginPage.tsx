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

 *   - Telegram lives in the same icon row; clicking it programmatically
 *     opens Telegram's native confirm popup via the JS API (no widget
 *     button, no modal). See ``src/auth/telegramLogin.ts``.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { tokenStore } from '@/api/client';
import { startOAuth, OAUTH_PROVIDERS, telegramAuthApi } from '@/api/endpoints/oauth';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import type { OAuthProvider, Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { openTelegramLogin } from '@/auth/telegramLogin';

// Monochrome brand glyphs taken from simple-icons (CC0). All four use
// `fill: currentColor` so the row stays in lockstep with the theme. The
// Yandex glyph is the Latin-Y mark that Яндекс ID uses in their own
// brand kit — a stylised single-stroke Y that's recognisable in mono.
function OAuthGlyph({ provider }: { provider: OAuthProvider }) {
  const common = {
    className: 'h-5 w-5',
    'aria-hidden': true,
    fill: 'currentColor' as const,
    viewBox: '0 0 24 24',
  };
  if (provider === 'google') {
    // Source: simple-icons/google.svg
    return (
      <svg {...common}>
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    );
  }
  if (provider === 'yandex') {
    // Source: Yandex official "Я in circle" mark
    // (commons.wikimedia.org/.../Yandex_icon.svg, brand orange stripped).
    // We render it monochromatically by combining the two sub-paths
    // (disc + Я letterform) into a single path with the evenodd rule —
    // the Я is *cut out* of the filled disc, letting the page background
    // show through. That keeps it true monochrome (currentColor only)
    // and inverts correctly when the theme flips.
    return (
      <svg {...common}>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10zm11.28-4.334h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z"
        />
      </svg>
    );
  }
  if (provider === 'telegram') {
    // Source: simple-icons/telegram.svg — full disc with paper-plane cut-out.
    return (
      <svg {...common}>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    );
  }
  if (provider === 'github') {
    // Source: simple-icons/github.svg
    return (
      <svg {...common}>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z" />
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
  const [tgBusy, setTgBusy] = useState(false);

  const onTelegramClick = async () => {
    if (tgBusy) return;
    setTgBusy(true);
    try {
      const info = await telegramAuthApi.info();
      if (!info.enabled || !info.bot_id) {
        notify.info('Вход через Telegram пока не настроен администратором');
        return;
      }
      const ok = await openTelegramLogin({
        bot_id: info.bot_id,
        redirect_uri: info.redirect_uri,
      });
      if (!ok) {
        notify.error('Не удалось загрузить Telegram-виджет');
      }
    } catch {
      notify.error('Не удалось открыть вход через Telegram');
    } finally {
      setTgBusy(false);
    }
  };

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

  // Display row: same order as OAUTH_PROVIDERS + Telegram appended.
  // Telegram doesn't speak OAuth2 — its popup is opened via the JS
  // ``Telegram.Login.auth`` helper from src/auth/telegramLogin.ts.
  const providerRow: { id: OAuthProvider; label: string }[] = [
    ...OAUTH_PROVIDERS,
    { id: 'telegram' as OAuthProvider, label: 'Telegram' },
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
            {providerRow.map((p) => {
              const busy = p.id === 'telegram' && tgBusy;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Войти через ${p.label}`}
                  title={p.label}
                  data-testid={`login-oauth-${p.id}`}
                  disabled={busy}
                  onClick={() => {
                    if (p.id === 'telegram') {
                      void onTelegramClick();
                      return;
                    }
                    // ``next`` carries the protected path the user was
                    // headed to before the redirect to /login. We bring
                    // them back there post-OAuth — but only when the path
                    // is a real protected destination. A ``next`` that
                    // points into /auth/* (password-reset, verify-email,
                    // oauth-callback) is nonsense as a landing target and
                    // would short-circuit AuthProvider's refresh on
                    // bootstrap (path.startsWith('/auth/') is treated as
                    // anonymous). Fall back to the SPA root in that case.
                    const rawNext = params.get('next');
                    const next = rawNext ? decodeURIComponent(rawNext) : null;
                    const safeNext =
                      next && !next.startsWith('/auth/') ? next : null;
                    startOAuth(
                      p.id,
                      safeNext ?? window.location.origin + '/',
                    );
                  }}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:border-foreground hover:bg-foreground hover:text-background disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <OAuthGlyph provider={p.id} />
                  )}
                </button>
              );
            })}
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
