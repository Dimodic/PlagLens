/**
 * LoginPage — single entry point for both sign-in and sign-up.
 *
 * Two modes share one screen (same brand header, same OAuth row, same
 * «или по почте» divider). The bottom footer toggles between them — no
 * page navigation, no flicker, no re-mount of the OAuth row.
 *
 * Why merged: the previous /register lived in a separate Card on a
 * different route. Switching mid-flow meant a navigation + losing all
 * typed input. Users routinely conflate the two anyway («I want to
 * sign in… wait, I don't have an account»). Same surface = same mental
 * model, OAuth becomes a true «one-click» path for both.
 *
 * The /register URL still works — routes/index.tsx redirects it to
 * `/login?mode=register` so external links and bookmarks aren't broken.
 *
 * Registration intentionally has no «Organisation» or «Invitation code»
 * field. Backend (identity 0007+) plants self-registered users in a
 * placeholder «public» tenant. The real organisation is picked up
 * later when the user redeems an invitation code on /me — the redeem
 * endpoint migrates ``user.tenant_id`` to the inviting tenant and
 * requires_relogin flips so the SPA refreshes the JWT.
 *
 * Design notes per .claude/UI_RULES.md:
 *   - No card chrome. One narrow column on a flat background.
 *   - OAuth row first (icons only — Google / Яндекс / Telegram / GitHub),
 *     then the email/password form. The icon row reads as the "fast path"
 *     and the form as the fallback.
 *   - All OAuth glyphs are monochrome (use currentColor) so the row feels
 *     like a single element of the page, not a brand carnival.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { tokenStore } from '@/api/client';
import { startOAuth, OAUTH_PROVIDERS } from '@/api/endpoints/oauth';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { OAuthProvider, Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emailSchema, passwordSchema } from '@/utils/validators';
import { BrandMark } from '@/components/shell/BrandMark';

type Mode = 'login' | 'register' | 'forgot';

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
    return (
      <svg {...common}>
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    );
  }
  if (provider === 'yandex') {
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
    return (
      <svg {...common}>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    );
  }
  if (provider === 'github') {
    return (
      <svg {...common}>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z" />
      </svg>
    );
  }
  return null;
}

export function LoginPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { login, reloadMe } = useAuth();

  // ?mode=register / ?mode=forgot let external links (and the /register
  // + /auth/forgot redirects) deep-link into a specific mode. Default
  // to sign-in.
  const queryMode = params.get('mode');
  const initialMode: Mode =
    queryMode === 'register'
      ? 'register'
      : queryMode === 'forgot'
        ? 'forgot'
        : 'login';
  const [mode, setMode] = useState<Mode>(initialMode);
  useDocumentTitle(
    mode === 'register'
      ? t('auth.register.title')
      : mode === 'forgot'
        ? t('auth.forgot.title')
        : t('auth.login.title'),
  );

  // Shared input state — email is reused across both modes; password
  // intentionally NOT reused so an autofilled login password doesn't
  // bleed into a registration attempt.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Login-only state
  const [totpCode, setTotpCode] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Register-only state
  const [displayName, setDisplayName] = useState('');
  const [password2, setPassword2] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [password2Error, setPassword2Error] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  // Forgot-only state. We don't ask for tenant — backend resolves by
  // unique email (login uses the same trick).
  const [forgotSent, setForgotSent] = useState(false);

  // Inline confirm-password validation: as soon as the user has typed
  // anything in the second field we mirror «не совпадает» against the
  // primary password. Cleared when either field is empty so we don't
  // shout at empty inputs.
  useEffect(() => {
    if (mode !== 'register') return;
    if (!password2) {
      setPassword2Error(null);
      return;
    }
    setPassword2Error(password2 === password ? null : t('auth.reset.errors.confirm'));
  }, [mode, password, password2, t]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setProblem(null);
    setEmailError(null);
    setPasswordError(null);
    setDisplayNameError(null);
    setPassword2Error(null);
    setRegistered(false);
    setForgotSent(false);
    // Keep the URL in sync so a refresh / share preserves the mode.
    const nextParams = new URLSearchParams(params);
    if (next === 'login') nextParams.delete('mode');
    else nextParams.set('mode', next);
    setParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const err = params.get('error');
    if (err !== 'oauth_email_exists') return;
    const providerName = params.get('provider') ?? t('auth.login.this_provider');
    const providerLabel: Record<string, string> = {
      google: 'Google',
      yandex: t('auth.login.provider_yandex'),
      stepik: 'Stepik',
      github: 'GitHub',
      telegram: 'Telegram',
    };
    const niceProvider = providerLabel[providerName] ?? providerName;
    const emailFromQuery = params.get('email');
    if (emailFromQuery) setEmail(emailFromQuery);
    setHint(t('auth.login.oauth_email_exists_hint', { provider: niceProvider }));
    // Strip the one-shot OAuth-error params from the URL so a reload (or
    // a shared link) doesn't resurrect the hint. We keep any unrelated
    // params (e.g. ?next=…). The hint already lives in React state.
    const cleaned = new URLSearchParams(params);
    cleaned.delete('error');
    cleaned.delete('provider');
    cleaned.delete('email');
    setParams(cleaned, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = () => {
    const next = params.get('next');
    navigate(next ? decodeURIComponent(next) : '/', { replace: true });
  };

  /* ---------- Login ---------- */
  const validateLogin = (): boolean => {
    let ok = true;
    if (!/^.+@.+\..+$/.test(email)) {
      setEmailError(t('auth.login.errors.email')); ok = false;
    } else { setEmailError(null); }
    if (password.length < 1) {
      setPasswordError(t('auth.login.errors.password')); ok = false;
    } else { setPasswordError(null); }
    if (mfaToken && !/^\d{6}$/.test(totpCode)) {
      setTotpError(t('auth.login.errors.totp')); ok = false;
    } else { setTotpError(null); }
    return ok;
  };

  const handleLogin = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!validateLogin()) return;
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

  /* ---------- Register ---------- */
  const validateRegister = (): boolean => {
    let ok = true;
    const e = emailSchema.safeParse(email);
    if (!e.success) {
      setEmailError(e.error.issues[0]?.message ?? t('auth.login.errors.email'));
      ok = false;
    } else { setEmailError(null); }
    if (displayName.trim().length < 2) {
      setDisplayNameError(t('auth.register.errors.display_name')); ok = false;
    } else { setDisplayNameError(null); }
    const p = passwordSchema.safeParse(password);
    if (!p.success) {
      setPasswordError(p.error.issues[0]?.message ?? t('auth.register.errors.weak_password'));
      ok = false;
    } else { setPasswordError(null); }
    if (password2 !== password || !password2) {
      setPassword2Error(password2 ? t('auth.reset.errors.confirm') : t('auth.register.errors.confirm_required'));
      ok = false;
    } else { setPassword2Error(null); }
    return ok;
  };

  const handleRegister = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    if (!validateRegister()) return;
    setSubmitting(true);
    try {
      await authApi.register({
        email,
        password,
        display_name: displayName.trim(),
        locale,
        // Intentionally no tenant_slug / invitation_token — backend
        // plants the user in the default «public» tenant, and the user
        // can redeem an invitation code from /me later to move into a
        // real organisation.
      });
      setRegistered(true);
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Forgot password ---------- */
  const handleForgot = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    if (!/^.+@.+\..+$/.test(email)) {
      setEmailError(t('auth.login.errors.email'));
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      // Note: backend's 202 response is opaque (it never reveals
      // whether the email exists), so we always land in the success
      // state regardless of the actual outcome.
      await authApi.passwordForgot(email);
      setForgotSent(true);
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Render ---------- */
  const credentialsValid = useMemo(
    () => /^.+@.+\..+$/.test(email) && password.length > 0,
    [email, password],
  );

  const registerCanSubmit = useMemo(
    () =>
      /^.+@.+\..+$/.test(email) &&
      displayName.trim().length >= 2 &&
      password.length >= 8 &&
      password2.length > 0 &&
      password === password2,
    [email, displayName, password, password2],
  );

  // Map the few problem codes we expect to friendly Russian. Bad-login
  // comes back as ``UNAUTHENTICATED`` (title "Invalid credentials") — we
  // never want that raw English string leaking into the form, so anything
  // unmapped falls back to a generic Russian line rather than
  // ``problem.title``.
  const inlineErrorMessage = problem
    ? problem.code === 'INVALID_CREDENTIALS' ||
      problem.code === 'UNAUTHENTICATED'
      ? t('auth.login.error_invalid_credentials')
      : problem.code === 'CONFLICT'
        ? t('auth.login.error_email_exists')
        : problem.code === 'TOO_MANY_REQUESTS'
          ? t('auth.login.error_too_many_requests')
          : t('auth.login.error_generic')
    : null;

  const providerRow = OAUTH_PROVIDERS;

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  return (
    <div
      data-testid="login-page"
      className="flex min-h-screen items-center justify-center bg-background px-6 py-12"
    >
      <main className="w-full max-w-sm space-y-10">
        {/* Brand */}
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandMark cropped className="h-14 w-14" title="PlagLens" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              PlagLens
            </h1>
            <p className="text-sm text-muted-foreground">
              {isRegister
                ? t('auth.register.subtitle')
                : isForgot
                  ? t('auth.forgot.subtitle')
                  : t('auth.login.subtitle')}
            </p>
          </div>
        </header>

        {/* OAuth row — irrelevant for «forgot password» (those users
            don't have a password to reset; they sign in through the
            provider). Hidden in that mode to keep the screen focused
            on the single «введи email» input. */}
        {!isForgot && (
        <section className="space-y-4">
          <div className="flex justify-center gap-3">
            {providerRow.map((p) => {
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={
                    isRegister
                      ? t('auth.register.oauth_aria', { provider: p.label })
                      : t('auth.login.oauth_aria', { provider: p.label })
                  }
                  title={p.label}
                  data-testid={`login-oauth-${p.id}`}
                  onClick={() => {
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
                  <OAuthGlyph provider={p.id} />
                </button>
              );
            })}
          </div>
          <div className="relative flex items-center">
            <span className="flex-1 border-t border-border" aria-hidden />
            <span className="px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('auth.login.email_divider')}
            </span>
            <span className="flex-1 border-t border-border" aria-hidden />
          </div>
        </section>
        )}

        {isForgot ? (
          /* Forgot-password form. One email input + a submit. No tenant
             slug — the backend resolves by unique email (same trick
             /auth/login uses). Success state intentionally lies a bit:
             the backend's 202 is opaque (doesn't reveal whether the
             address exists) so we always show «check your inbox». */
          forgotSent ? (
            <div
              className="space-y-4 text-center"
              data-testid="forgot-success"
            >
              <div className="flex flex-col items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-6 w-6 text-foreground/70" />
                <p>
                  {t('auth.forgot.sent_before')}{' '}
                  <span className="font-medium">{email}</span>{' '}
                  {t('auth.forgot.sent_after')}
                </p>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleForgot}
              noValidate
              className="space-y-4"
              data-testid="forgot-form"
            >
              <div className="space-y-1.5">
                <Label
                  htmlFor="forgot-email"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {t('auth.login.email')}
                </Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  data-testid="forgot-email"
                  className="h-11"
                  aria-invalid={!!emailError}
                />
                {emailError && (
                  <p role="alert" className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>

              {inlineErrorMessage && (
                <p
                  role="alert"
                  data-testid="problem-alert"
                  className="text-sm text-destructive"
                >
                  {inlineErrorMessage}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting || !/^.+@.+\..+$/.test(email)}
                data-testid="forgot-submit"
                className="w-full h-11 text-sm font-medium"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.forgot.submit')}
              </Button>
            </form>
          )
        ) : isRegister ? (
          /* Registration form. No organisation field — backend lands the
             user in a placeholder tenant until they redeem a code. */
          registered ? (
            <div className="space-y-4 text-center" data-testid="register-success">
              <p className="text-sm text-foreground">
                {t('auth.register.success_before')}{' '}
                <span className="font-medium">{email}</span>{' '}
                {t('auth.register.success_after')}
              </p>
              <Button
                type="button"
                className="w-full h-11 text-sm font-medium"
                onClick={() => switchMode('login')}
              >
                {t('auth.login.submit')}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleRegister}
              noValidate
              className="space-y-4"
              data-testid="register-form"
            >
              <div className="space-y-1.5">
                <Label htmlFor="register-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('auth.login.email')}
                </Label>
                <Input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  data-testid="register-email"
                  className="h-11"
                  aria-invalid={!!emailError}
                />
                {emailError && (
                  <p role="alert" className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('auth.register.name_label')}
                </Label>
                <Input
                  id="register-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                  autoComplete="name"
                  data-testid="register-display-name"
                  className="h-11"
                  aria-invalid={!!displayNameError}
                />
                {displayNameError && (
                  <p role="alert" className="text-xs text-destructive">
                    {displayNameError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('auth.login.password')}
                </Label>
                <Input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  data-testid="register-password"
                  className="h-11"
                  aria-invalid={!!passwordError}
                />
                {passwordError && (
                  <p role="alert" className="text-xs text-destructive">
                    {passwordError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-password2" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('auth.register.confirm_password_label')}
                </Label>
                <Input
                  id="register-password2"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.currentTarget.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  data-testid="register-password2"
                  className="h-11"
                  aria-invalid={!!password2Error}
                />
                {password2Error && (
                  <p role="alert" className="text-xs text-destructive">
                    {password2Error}
                  </p>
                )}
              </div>

              {inlineErrorMessage && (
                <p
                  role="alert"
                  data-testid="problem-alert"
                  className="text-sm text-destructive"
                >
                  {inlineErrorMessage}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting || !registerCanSubmit}
                data-testid="register-submit"
                className="w-full h-11 text-sm font-medium"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.register.submit')}
              </Button>
            </form>
          )
        ) : (
          /* Login form */
          <form onSubmit={handleLogin} noValidate className="space-y-4" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('auth.login.email')}
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
                  {t('auth.login.password')}
                </Label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  data-testid="login-forgot-link"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('auth.login.forgot')}
                </button>
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
                  {t('auth.login.totp')}
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
              <p
                data-testid="login-hint"
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {hint}
              </p>
            )}

            {(problem || inlineErrorMessage) && (
              <p
                role="alert"
                data-testid="problem-alert"
                className="text-sm text-destructive"
              >
                {inlineErrorMessage}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting || (!mfaToken && !credentialsValid)}
              data-testid="login-submit"
              className="w-full h-11 text-sm font-medium"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mfaToken ? t('auth.twofa.submit') : t('auth.login.submit')}
            </Button>
          </form>
        )}

        {/* Mode toggle — internal switch (no navigation, no full-page
            re-mount), so the OAuth row above stays in place. */}
        <div className="text-center text-xs text-muted-foreground">
          {isForgot ? (
            <button
              type="button"
              onClick={() => switchMode('login')}
              data-testid="forgot-to-login"
              className="font-medium text-foreground hover:underline"
            >
              {t('auth.forgot.back')}
            </button>
          ) : isRegister ? (
            <>
              {t('auth.register.have_account')}{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                data-testid="register-to-login"
                className="font-medium text-foreground hover:underline"
              >
                {t('auth.login.submit')}
              </button>
            </>
          ) : (
            <>
              {t('auth.login.no_account')}{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                data-testid="login-register-link"
                className="font-medium text-foreground hover:underline"
              >
                {t('auth.login.register')}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
