/**
 * Inline password-change block for /me/profile.
 *
 * Collapsed by default — a single row «Пароль · Сменить →». The user
 * doesn't change their password every visit, so three input fields on
 * permanent display is just noise. Click expands an inline form; Save
 * or Cancel collapses it again.
 */
import { ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useChangePassword } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/components/ui/utils';
import type { Problem } from '@/api/types';

export function PasswordSection() {
  const notify = useNotifications();
  const change = useChangePassword();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setProblem(null);
  };

  const submit = async () => {
    setProblem(null);
    if (next !== confirm) {
      setProblem({ title: 'Пароли не совпадают', status: 400, code: 'MISMATCH' });
      return;
    }
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      notify.success('Пароль изменён');
      reset();
      setOpen(false);
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          if (open) reset();
          setOpen(!open);
        }}
        className="group flex w-full items-center justify-between text-left"
        data-testid="profile-password-toggle"
        aria-expanded={open}
      >
        <span className="text-sm text-foreground">Пароль</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          {open ? 'Закрыть' : 'Сменить'}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {problem && <ProblemAlert problem={problem} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-password-current" className="text-xs">
                Текущий
              </Label>
              <Input
                id="profile-password-current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.currentTarget.value)}
                autoComplete="current-password"
                data-testid="profile-password-current"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-password-new" className="text-xs">
                Новый
              </Label>
              <Input
                id="profile-password-new"
                type="password"
                value={next}
                onChange={(e) => setNext(e.currentTarget.value)}
                autoComplete="new-password"
                data-testid="profile-password-new"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-password-confirm" className="text-xs">
                Подтверждение
              </Label>
              <Input
                id="profile-password-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                autoComplete="new-password"
                data-testid="profile-password-confirm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={submit}
              disabled={change.isPending || !current || !next || !confirm}
              data-testid="profile-password-submit"
            >
              {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сменить пароль
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={change.isPending}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PasswordSection;
