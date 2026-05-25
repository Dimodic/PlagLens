/**
 * Inline password-change block for /me/profile.
 *
 * No Card chrome — sits flush with the rest of the open-document layout.
 * Three inputs + one button. ProblemAlert shows server errors inline.
 */
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useChangePassword } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';

export function PasswordSection() {
  const notify = useNotifications();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const submit = async () => {
    setProblem(null);
    if (next !== confirm) {
      setProblem({ title: 'Пароли не совпадают', status: 400, code: 'MISMATCH' });
      return;
    }
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      notify.success('Пароль изменён');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Пароль</h3>
      {problem && <ProblemAlert problem={problem} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-password-current">Текущий</Label>
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
          <Label htmlFor="profile-password-new">Новый</Label>
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
          <Label htmlFor="profile-password-confirm">Подтверждение</Label>
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
      <div>
        <Button
          onClick={submit}
          disabled={change.isPending || !current || !next || !confirm}
          data-testid="profile-password-submit"
        >
          {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Сменить пароль
        </Button>
      </div>
    </div>
  );
}

export default PasswordSection;
