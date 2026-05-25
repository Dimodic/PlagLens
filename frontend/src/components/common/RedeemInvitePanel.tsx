/**
 * "Have an invitation code?" panel for /me/profile and /me/assignments.
 *
 * Lifecycle after a successful POST /invitations:redeem:
 *
 *   1. ``refresh()`` mints a new access token from users.global_role in
 *      the DB (auth_service.refresh reads it fresh), so the new role
 *      lands in the JWT without a re-login.
 *   2. ``invalidateQueries()`` drops cached role-gated lists.
 *   3. If a global-role was bumped, we trigger a top-level navigation
 *      to ``/`` — that wipes the in-memory React tree built around the
 *      old role (sidebar, route guards, default landing) and re-mounts
 *      everything against the new principal. It's a one-frame redirect,
 *      not a hard reload-and-reauth, and it sidesteps a class of subtle
 *      "роль обновилась, но сайдбар ещё студенческий" bugs.
 *
 * No persistent success card — the toast does the talking. Earlier
 * versions stacked a coloured card under the form that the user
 * complained read as visual clutter.
 */
import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNotifications } from '@/hooks/useNotifications';
import { useRedeemInvitation } from '@/hooks/api/useInvitations';
import { useAuth } from '@/auth/useAuth';
import { roleLabel } from '@/lib/roles';
import type { GlobalRole, Problem } from '@/api/types';

export function RedeemInvitePanel() {
  const notify = useNotifications();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const redeem = useRedeemInvitation();
  const [code, setCode] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await redeem.mutateAsync(code.trim());
      setCode('');

      // Re-mint the access token + drop caches so the rest of the SPA
      // sees the fresh principal.
      await refresh();
      await queryClient.invalidateQueries();

      if (r.role_applied) {
        const human = roleLabel(r.role_applied as GlobalRole);
        notify.success(`Роль обновлена: ${human}`);
        // Bounce to root so the role-gated shell (sidebar, default
        // landing for the new role) rebuilds from a clean tree.
        // assign() not reload() — keeps the freshly minted access
        // token in memory, no extra /auth/refresh round-trip.
        window.location.assign('/');
        return;
      }

      if (r.course_id) {
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
    <form onSubmit={onSubmit} className="space-y-2">
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
    </form>
  );
}
