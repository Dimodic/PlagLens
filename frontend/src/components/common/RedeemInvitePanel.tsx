/**
 * "Have an invitation code?" panel for /me/profile.
 *
 * Single input + button. Successful redeem reloads /me so the new role or
 * course membership is reflected immediately; if global_role was bumped the
 * server sets `requires_relogin` and we show a hint to re-login (so the new
 * role makes it into the JWT — refresh-rotate alone isn't enough because the
 * access token claims are stable until the next /refresh).
 */
import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNotifications } from '@/hooks/useNotifications';
import { useRedeemInvitation } from '@/hooks/api/useInvitations';
import { useAuth } from '@/auth/useAuth';
import type { Problem } from '@/api/types';
import type { RedeemResult } from '@/api/endpoints/invitations';

export function RedeemInvitePanel() {
  const notify = useNotifications();
  const { reloadMe, logout } = useAuth();
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
      await reloadMe();
      if (r.role_applied) {
        notify.success(`Роль обновлена: ${r.role_applied}`);
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
          <div className="space-y-1">
            {result.role_applied && (
              <div>Глобальная роль: <strong>{result.role_applied}</strong></div>
            )}
            {result.course_id && (
              <div>
                Добавлены в курс <code className="rounded bg-muted px-1">{result.course_id}</code>
                {result.course_role && (
                  <> с ролью <strong>{result.course_role}</strong></>
                )}
              </div>
            )}
            {result.requires_relogin && (
              <div className="pt-1 text-xs text-muted-foreground">
                Чтобы новая роль применилась во всех разделах, перезайдите.{' '}
                <button
                  type="button"
                  onClick={() => logout()}
                  className="underline hover:text-foreground"
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
