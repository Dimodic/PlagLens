/**
 * Inline active-sessions block for /me/profile.
 *
 * Each session is a flat row with a hairline divider. Revoking the CURRENT
 * session is the same as «Выйти» — we drop the token and bounce to /login,
 * since the page the user is on no longer has a session behind it. A
 * «Завершить все» action in the header kills every session (incl. this one)
 * and logs out too.
 */
import { Loader2, LogOut, Monitor } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import {
  useMySessions,
  useRevokeAllSessions,
  useRevokeSession,
} from '@/hooks/api/useUsers';
import { useAuth } from '@/auth/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export function SessionsSection() {
  const { t } = useTranslation();
  const notify = useNotifications();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const sessionsQ = useMySessions();
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Closing the current session == «Выйти»: clear the client token and go to
  // /login so the user isn't left on a page their session no longer backs.
  const signOutHere = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  const onRevoke = async (id: string, isCurrent: boolean) => {
    if (isCurrent) {
      await signOutHere();
      return;
    }
    setLoadingId(id);
    try {
      await revoke.mutateAsync(id);
      notify.success(t('sessions_section.revoke_success'));
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('sessions_section.revoke_error'));
    } finally {
      setLoadingId(null);
    }
  };

  const onRevokeAll = async () => {
    try {
      await revokeAll.mutateAsync();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('sessions_section.revoke_error'));
      return;
    }
    // Kills the current session too — log out right after.
    await signOutHere();
  };

  const sessions = sessionsQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm text-foreground">{t('sessions_section.heading')}</h3>
        {sessions.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground hover:text-destructive"
            onClick={onRevokeAll}
            disabled={revokeAll.isPending}
            data-testid="sessions-revoke-all"
          >
            {revokeAll.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('sessions_section.end_all')}
          </Button>
        )}
      </div>
      {sessionsQ.isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('common.loading')}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('sessions_section.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="sessions-list">
          {sessions.map((s) => (
            <li
              key={s.id}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2.5',
                s.current &&
                  'bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/20',
              )}
              data-testid={`session-row-${s.id}`}
            >
              <Monitor
                className={cn(
                  'h-4 w-4 flex-none',
                  s.current
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/70',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-foreground/90">
                    {s.ip || '—'}
                  </span>
                  {s.current && (
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t('sessions_section.current')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.user_agent || t('sessions_section.unknown_client')}
                </div>
                <div className="text-[11px] text-muted-foreground/70">
                  {t('sessions_section.last_active')}{' '}
                  {s.last_used_at
                    ? dayjs(s.last_used_at).format('D MMM, HH:mm')
                    : dayjs(s.created_at).format('D MMM, HH:mm')}
                </div>
              </div>
              {/* Icon-only — the IP + client already say which session this is,
                  so the «Завершить» label was just noise on every row. */}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 flex-none text-muted-foreground hover:text-destructive"
                disabled={loadingId === s.id}
                onClick={() => onRevoke(s.id, !!s.current)}
                aria-label={
                  s.current
                    ? t('sessions_section.end_current')
                    : t('sessions_section.revoke')
                }
                title={
                  s.current
                    ? t('sessions_section.end_current')
                    : t('sessions_section.revoke')
                }
                data-testid={`session-revoke-${s.id}`}
              >
                {loadingId === s.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SessionsSection;
