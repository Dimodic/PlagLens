/**
 * Invitations block inside /admin/tenants/:id → "Пользователи" tab.
 *
 * Lists active invitations with their short code; lets the admin issue a new
 * one (role + optional email + optional course_id) and revoke an existing
 * one. Copy-to-clipboard on the code cell.
 */
import { useState } from 'react';
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
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
import { StatusPill } from '@/components/common/StatusPill';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
} from '@/hooks/api/useInvitations';
import type {
  Invitation,
  InviteRole,
} from '@/api/endpoints/invitations';
import type { Problem } from '@/api/types';

const ROLE_LABEL: Record<InviteRole, string> = {
  teacher: 'Преподаватель',
  assistant: 'Ассистент',
  student: 'Студент',
};

function pillTone(inv: Invitation): 'success' | 'warning' | 'neutral' {
  if (inv.accepted_at) return 'success';
  if (dayjs(inv.expires_at).isBefore(dayjs())) return 'warning';
  return 'neutral';
}

function pillLabel(inv: Invitation): string {
  if (inv.accepted_at) return 'использовано';
  if (dayjs(inv.expires_at).isBefore(dayjs())) return 'истекло';
  return 'активно';
}

export function TenantInvitationsPanel({ tenantId }: { tenantId: string }) {
  const notify = useNotifications();
  const listQ = useInvitations();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();

  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState<InviteRole>('student');
  const [email, setEmail] = useState('');
  const [courseId, setCourseId] = useState('');

  // Identity returns all invitations the caller can see (admin → all in
  // tenant); filter to the tenant we're viewing in case super-admin opened
  // the page from a different tenant.
  const list = (listQ.data ?? []).filter((inv) => inv.tenant_id === tenantId);
  const active = list.filter((inv) => !inv.accepted_at && !dayjs(inv.expires_at).isBefore(dayjs()));
  const past = list.filter((inv) => inv.accepted_at || dayjs(inv.expires_at).isBefore(dayjs()));

  const onSubmit = async () => {
    try {
      await create.mutateAsync({
        role,
        email: email.trim() || undefined,
        course_id: courseId.trim() || undefined,
      });
      notify.success('Приглашение создано');
      setShowForm(false);
      setEmail('');
      setCourseId('');
      setRole('student');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось создать');
    }
  };

  const onCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notify.success(`Код ${code} скопирован`);
    } catch {
      notify.error('Не удалось скопировать');
    }
  };

  const onRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      notify.success('Приглашение отозвано');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? 'Не удалось отозвать');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Приглашения</h3>
          <p className="text-xs text-muted-foreground">
            Создайте код и передайте пользователю — он введёт его в профиле
            после регистрации.
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(true)}
            data-testid="invitation-new-button"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Новое
          </Button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">Роль</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                <SelectTrigger id="inv-role" data-testid="invitation-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Преподаватель</SelectItem>
                  <SelectItem value="assistant">Ассистент</SelectItem>
                  <SelectItem value="student">Студент</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email (опционально)</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="user@example.com"
                data-testid="invitation-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-course">Курс (опционально)</Label>
              <Input
                id="inv-course"
                value={courseId}
                onChange={(e) => setCourseId(e.currentTarget.value)}
                placeholder="crs_..."
                data-testid="invitation-course-input"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={create.isPending}
            >
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={create.isPending}
              data-testid="invitation-create-submit"
            >
              {create.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Создать
            </Button>
          </div>
        </div>
      )}

      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : active.length === 0 && past.length === 0 ? (
        <p className="text-sm text-muted-foreground">Приглашений пока нет.</p>
      ) : (
        <div className="space-y-1">
          {active.map((inv) => (
            <div
              key={inv.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md border bg-background px-3 py-2"
              data-testid={`invitation-row-${inv.id}`}
            >
              <code
                className="cursor-pointer rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider hover:bg-muted/70"
                onClick={() => inv.code && onCopy(inv.code)}
                title="Скопировать код"
              >
                {inv.code ?? '—'}
              </code>
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {ROLE_LABEL[inv.role] ?? inv.role}
                  {inv.course_id && (
                    <span className="ml-1.5 text-muted-foreground">
                      · курс {inv.course_id}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {inv.email || 'без email'} · до {dayjs(inv.expires_at).format('D MMM HH:mm')}
                </div>
              </div>
              <StatusPill tone={pillTone(inv)}>{pillLabel(inv)}</StatusPill>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => inv.code && onCopy(inv.code)}
                  disabled={!inv.code}
                  aria-label="Скопировать код"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onRevoke(inv.id)}
                  disabled={revoke.isPending}
                  aria-label="Отозвать"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {past.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                История ({past.length})
              </summary>
              <div className="mt-2 space-y-1">
                {past.map((inv) => (
                  <div
                    key={inv.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <code className="font-mono">{inv.code ?? '—'}</code>
                    <span className="truncate">
                      {ROLE_LABEL[inv.role] ?? inv.role} · {inv.email || 'без email'}
                    </span>
                    <StatusPill tone={pillTone(inv)}>{pillLabel(inv)}</StatusPill>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
