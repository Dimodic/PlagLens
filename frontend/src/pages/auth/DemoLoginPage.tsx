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
import { authApi } from '@/api/endpoints/auth';
import { tokenStore } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Problem } from '@/api/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/components/ui/utils';

interface DemoAccount {
  email: string;
  password: string;
  label: string;
  role: string;
  roleLabel: string;
  testId: string;
  description: string;
}

// Demo buttons map to the real seed accounts of the КНАД C++ 24/25 course
// (system admin lives in the `system` tenant; everyone else in `hse-fkn`).
// Backend now auto-resolves tenant_slug from email when omitted.
const ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@plaglens.local',
    password: 'changeme',
    label: 'Администратор',
    role: 'admin',
    roleLabel: 'админ',
    testId: 'admin',
    description: '«Бог» учреждения — назначает преподавателей, общий ключ LLM',
  },
  {
    email: 'gordenko.mk@edu.hse.ru',
    password: 'changeme',
    label: 'Преподаватель',
    role: 'teacher',
    roleLabel: 'преподаватель',
    testId: 'teacher',
    description: 'Горденко М.К. — лектор курса C++ КНАД 24/25',
  },
  {
    email: 'bityukov.p@edu.hse.ru',
    password: 'changeme',
    label: 'Ассистент',
    role: 'teacher',
    roleLabel: 'ассистент',
    testId: 'assistant',
    description: 'Битюков Павел — проверяет посылки группы КНАД242',
  },
  {
    email: 'student.test@edu.hse.ru',
    password: 'changeme',
    label: 'Студент',
    role: 'student',
    roleLabel: 'студент',
    testId: 'student1',
    description: 'Иван Петров — учится на C++ КНАД 24/25',
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function DemoLoginPage() {
  useDocumentTitle('Демо-режим');

  const navigate = useNavigate();
  const { reloadMe } = useAuth();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [mfaForEmail, setMfaForEmail] = useState<string | null>(null);

  const handleClick = async (acct: DemoAccount) => {
    if (busyEmail) return;
    setProblem(null);
    setMfaForEmail(null);
    setBusyEmail(acct.email);
    try {
      const resp = await authApi.login({
        email: acct.email,
        password: acct.password,
      });
      tokenStore.set(resp.access_token);
      await reloadMe();
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
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground text-xl font-semibold"
          >
            P
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Демо-режим
          </h1>
          <p className="text-sm text-muted-foreground">
            Один клик — мгновенный вход под выбранной ролью
          </p>
        </header>

        {problem && (
          <Alert variant="destructive" data-testid="problem-alert">
            <AlertTitle>{problem.title || 'Не удалось войти'}</AlertTitle>
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
                      {initials(a.label)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {a.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.roleLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {a.description}
                    </p>
                    {showMfaHint && (
                      <p
                        role="alert"
                        data-testid={`demo-mfa-hint-${a.testId}`}
                        className="mt-1.5 text-xs text-sev-mid"
                      >
                        У этого аккаунта включена двухфакторная
                        аутентификация. Войдите через{' '}
                        <Link
                          to="/login"
                          className="text-foreground underline"
                        >
                          обычный вход
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
            Эти аккаунты существуют только в seed-данных и не должны
            попадать в продакшн.
          </p>
          <p className="text-xs text-muted-foreground">
            <Link
              to="/login"
              data-testid="demo-back-to-login"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Обычный вход
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default DemoLoginPage;
