/**
 * Inline active-sessions block for /me/profile.
 *
 * Wraps SessionsTable (already used on /admin/users/:id) with the revoke
 * handler. Loading state shows a single spinner instead of a skeleton —
 * sessions are usually short lists.
 */
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { SessionsTable } from '@/components/me/SessionsTable';
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

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Активные сессии</h3>
      {sessionsQ.isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <SessionsTable
          sessions={sessionsQ.data ?? []}
          onRevoke={onRevoke}
          loadingId={loadingId}
        />
      )}
    </div>
  );
}

export default SessionsSection;
