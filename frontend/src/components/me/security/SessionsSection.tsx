/**
 * Inline active-sessions block for /me/profile.
 *
 * No Table, no rounded-md border — each session is a flat row with a
 * hairline divider, matching the rest of the open-document layout. The
 * old SessionsTable component is still used elsewhere (admin user
 * detail), but here we render a calmer per-row view.
 */
import { Loader2, LogOut, Monitor } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMySessions, useRevokeSession } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';

export function SessionsSection() {
  const notify = useNotifications();
  const sessionsQ = useMySessions();
  const revoke = useRevokeSession();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const onRevoke = async (id: string) => {
    setLoadingId(id);
    try {
      await revoke.mutateAsync(id);
      notify.success('Сессия завершена');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setLoadingId(null);
    }
  };

  const sessions = sessionsQ.data ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-foreground">Активные сессии</h3>
      {sessionsQ.isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загрузка…
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Сейчас активна только текущая сессия — других входов не зарегистрировано.
        </p>
      ) : (
        <ul className="divide-y divide-border/40" data-testid="sessions-list">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 py-2.5"
              data-testid={`session-row-${s.id}`}
            >
              <Monitor className="h-4 w-4 flex-none text-muted-foreground/70" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-foreground/90">
                    {s.ip || '—'}
                  </span>
                  {s.current && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      текущая
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.user_agent || 'неизвестный клиент'}
                </div>
                <div className="text-[11px] text-muted-foreground/70">
                  активна{' '}
                  {s.last_used_at
                    ? dayjs(s.last_used_at).format('D MMM, HH:mm')
                    : dayjs(s.created_at).format('D MMM, HH:mm')}
                </div>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={loadingId === s.id}
                  onClick={() => onRevoke(s.id)}
                >
                  {loadingId === s.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Завершить
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SessionsSection;
