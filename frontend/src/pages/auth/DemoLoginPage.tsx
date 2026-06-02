/**
 * /demo — one-click demo picker, RU-only.
 *
 * Visual contract: matches the redesigned `/login` page (no card chrome,
 * generous spacing, document-style minimalism). The previous version
 * wrapped the role list in a nested `<Card>` and gave every row its own
 * "Войти" button — visually busy. Here the whole row is the action:
 * click anywhere on it to sign in. The currently-loading row shows a
 * spinner inline and an aria-busy state; the others fade slightly so
 * it's clear which click is "ours".
 *
 * `data-testid="demo-card-{role}"` and `data-testid="demo-login-{role}"`
 * remain stable for existing Playwright suites.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/components/ui/utils';
import { BrandMark } from '@/components/shell/BrandMark';

interface DemoAccount {
  email: string;
  password: string;
  /** i18n key for the role's display name (resolved at render). */
  labelKey: string;
  role: string;
  /** i18n key for the short role tag (resolved at render). */
  roleLabelKey: string;
  testId: string;
  /** i18n key for the one-line account description (resolved at render). */
  descriptionKey: string;
}

// Demo buttons map to the real seed accounts of the КНАД C++ 24/25 course
// (system admin lives in the `system` tenant; everyone else in `hse-fkn`).
// Backend now auto-resolves tenant_slug from email when omitted.
const ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@plaglens.local',
    password: 'changeme',
    labelKey: 'demo_login.role_admin_label',
    role: 'admin',
    roleLabelKey: 'demo_login.role_admin_tag',
    testId: 'admin',
    descriptionKey: 'demo_login.role_admin_desc',
  },
  {
    email: 'teacher@plaglens.local',
    password: 'changeme',
    labelKey: 'demo_login.role_teacher_label',
    role: 'teacher',
    roleLabelKey: 'demo_login.role_teacher_tag',
    testId: 'teacher',
    descriptionKey: 'demo_login.role_teacher_desc',
  },
  {
    email: 'assistant@plaglens.local',
    password: 'changeme',
    labelKey: 'demo_login.role_assistant_label',
    role: 'teacher',
    roleLabelKey: 'demo_login.role_assistant_tag',
    testId: 'assistant',
    descriptionKey: 'demo_login.role_assistant_desc',
  },
  {
    email: 'student@plaglens.local',
    password: 'changeme',
    labelKey: 'demo_login.role_student_label',
    role: 'student',
    roleLabelKey: 'demo_login.role_student_tag',
    testId: 'student1',
    descriptionKey: 'demo_login.role_student_desc',
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function DemoLoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('demo_login.document_title'));

  const navigate = useNavigate();
  const { login } = useAuth();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [mfaForEmail, setMfaForEmail] = useState<string | null>(null);

  const handleClick = async (acct: DemoAccount) => {
    if (busyEmail) return;
    setProblem(null);
    setMfaForEmail(null);
    setBusyEmail(acct.email);
    try {
      const result = await login({
        email: acct.email,
        password: acct.password,
      });
      if (result.requiresMfa) {
        setMfaForEmail(acct.email);
        return;
      }
      navigate('/', { replace: true });
    } catch (raw) {
      const p = raw as Problem;
      if (p?.code === 'TWO_FACTOR_REQUIRED') {
        setMfaForEmail(acct.email);
      } else {
        setProblem(p);
      }
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <div
      data-testid="demo-page"
      className="flex min-h-screen items-center justify-center bg-background px-6 py-12"
    >
      <div className="w-full max-w-md space-y-10">
        {/* Brand block — same scale and rhythm as the /login page. */}
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandMark tile className="h-12 w-12 rounded-xl" title="PlagLens" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('demo_login.heading')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('demo_login.subtitle')}
          </p>
        </header>

        {problem && (
          <Alert variant="destructive" data-testid="problem-alert">
            <AlertTitle>{problem.title || t('demo_login.error_title')}</AlertTitle>
            {problem.detail && (
              <AlertDescription>{problem.detail}</AlertDescription>
            )}
          </Alert>
        )}

        {/* Role list — flat rows with thin dividers, no nested card.
            Whole row is the action; right-side chevron hints at it. */}
        <ul className="flex flex-col divide-y divide-border/60">
          {ACCOUNTS.map((a) => {
            const busy = busyEmail === a.email;
            const otherBusy = !!busyEmail && !busy;
            const showMfaHint = mfaForEmail === a.email;
            const label = t(a.labelKey);
            return (
              <li key={a.email} data-testid={`demo-card-${a.testId}`}>
                <button
                  type="button"
                  data-testid={`demo-login-${a.testId}`}
                  onClick={() => handleClick(a)}
                  disabled={otherBusy || busy}
                  aria-busy={busy}
                  className={cn(
                    'group w-full text-left flex items-center gap-3 py-4 transition-colors',
                    'hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none',
                    'disabled:cursor-not-allowed',
                    otherBusy && 'opacity-50',
                  )}
                >
                  <Avatar className="h-10 w-10 flex-none">
                    <AvatarFallback className="text-sm">
                      {initials(label)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(a.roleLabelKey)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {t(a.descriptionKey)}
                    </p>
                    {showMfaHint && (
                      <p
                        role="alert"
                        data-testid={`demo-mfa-hint-${a.testId}`}
                        className="mt-1.5 text-xs text-sev-mid"
                      >
                        {t('demo_login.mfa_hint_prefix')}{' '}
                        <Link
                          to="/login"
                          className="text-foreground underline"
                        >
                          {t('demo_login.mfa_hint_link')}
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                  {busy ? (
                    <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" />
                  ) : (
                    <ChevronRight
                      className="h-4 w-4 flex-none text-muted-foreground/60 transition-colors group-hover:text-foreground"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="space-y-4 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('demo_login.seed_disclaimer')}
          </p>
          <p className="text-xs text-muted-foreground">
            <Link
              to="/login"
              data-testid="demo-back-to-login"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('demo_login.back_to_login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default DemoLoginPage;
