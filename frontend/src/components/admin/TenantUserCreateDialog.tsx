/**
 * Create-user modal for the per-tenant «Пользователи» tab. Admin-only — the
 * backend places the new account in the given tenant (it reads ``tenant_id``
 * from the create payload when the caller is an admin).
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useCreateUser } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import type { GlobalRole, Problem } from '@/api/types';

interface Props {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenantUserCreateDialog({ tenantId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const create = useCreateUser();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<GlobalRole>('student');
  const [problem, setProblem] = useState<Problem | null>(null);

  const reset = () => {
    setEmail('');
    setName('');
    setRole('student');
    setProblem(null);
  };

  const submit = async () => {
    setProblem(null);
    try {
      await create.mutateAsync({
        email: email.trim(),
        display_name: name.trim(),
        global_role: role,
        locale: 'ru',
        tenant_id: tenantId,
      });
      notify.success(t('tenant_users.created'));
      reset();
      onOpenChange(false);
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tenant_users.create_title')}</DialogTitle>
        </DialogHeader>

        {problem && <ProblemAlert problem={problem} />}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tu-email">Email</Label>
            <Input
              id="tu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="user@example.com"
              data-testid="tenant-user-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tu-name">{t('user_create.name')}</Label>
            <Input
              id="tu-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              data-testid="tenant-user-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tu-role">{t('user_create.role')}</Label>
            <Select value={role} onValueChange={(v) => setRole((v as GlobalRole) ?? 'student')}>
              <SelectTrigger id="tu-role" data-testid="tenant-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">{t('tenant_invitations.role_student')}</SelectItem>
                <SelectItem value="assistant">{t('tenant_invitations.role_assistant')}</SelectItem>
                <SelectItem value="teacher">{t('tenant_invitations.role_teacher')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !email.trim() || !name.trim()}
            data-testid="tenant-user-create-submit"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TenantUserCreateDialog;
