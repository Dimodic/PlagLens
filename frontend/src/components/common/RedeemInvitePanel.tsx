/**
 * "Have an invitation code?" panel for /me/profile.
 *
 * Single input + button. After a successful redeem we:
 *
 *   1. ``refresh()`` the access token — auth_service.refresh re-issues
 *      it from ``users.global_role`` in the DB, so the new role lands
 *      in the JWT without forcing the user to log out manually.
 *   2. ``invalidateQueries()`` so role-gated lists (My courses, Admin
 *      sidebar, etc.) re-fetch with the fresh permissions.
 *
 * The backend still flags ``requires_relogin: true`` for global-role
 * bumps — we handle it silently now; the user just sees the toast and
 * the new sections show up. No "please log out" dialog.
 */
import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNotifications } from '@/hooks/useNotifications';
import { useRedeemInvitation } from '@/hooks/api/useInvitations';
import { useAuth } from '@/auth/useAuth';
import { roleLabel } from '@/lib/roles';
import type { GlobalRole, Problem } from '@/api/types';
import type { RedeemResult } from '@/api/endpoints/invitations';

export function RedeemInvitePanel() {
  const notify = useNotifications();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const redeem = useRedeemInvitation();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      const r = await redeem.mutateAsync(code.trim());
      setResult(r);
      setCode('');

      // Always pull a fresh access token after a redeem:
      //   • If a global-role was bumped, the new JWT picks it up
      //     (auth_service.refresh reads from users.global_role).
      //   • If only course membership changed, the access token claims
      //     don't change but we still want fresh /me + invalidated
      //     query caches so course lists re-render.
      await refresh();
      await queryClient.invalidateQueries();

      if (r.role_applied) {
        const human = roleLabel(r.role_applied as GlobalRole);
        notify.success(`Роль обновлена: ${human}`);
      } else if (r.course_id) {
        notify.success('Вы добавлены в курс');
      } else {
        notify.success('Код применён');
      }
    } catch (err) {
      const p = err as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось применить код');
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="redeem-code" className="flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          Код приглашения
        </Label>
        <div className="flex gap-2">
          <Input
            id="redeem-code"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder="XXX-XXX-XXX"
            autoComplete="off"
            className="font-mono tracking-wider uppercase"
            data-testid="redeem-code-input"
          />
          <Button
            type="submit"
            disabled={redeem.isPending || !code.trim()}
            data-testid="redeem-code-submit"
          >
            {redeem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Применить
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Код выдаёт администратор учреждения или преподаватель курса.
        </p>
      </div>

      {result && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="space-y-0.5">
            {result.role_applied && (
              <div>
                Глобальная роль:{' '}
                <strong>{roleLabel(result.role_applied as GlobalRole)}</strong>
              </div>
            )}
            {result.course_id && (
              <div>
                Добавлены в курс{' '}
                <code className="rounded bg-muted px-1">{result.course_id}</code>
                {result.course_role && (
                  <> · <strong>{roleLabel(result.course_role as GlobalRole)}</strong></>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
