/**
 * Invitations block inside /admin/tenants/:id → "Приглашения" tab.
 *
 * Lists active invitations with their short code; lets the admin issue a new
 * one (role + optional email + optional course_id, in a modal) and revoke an
 * existing one. Copy-to-clipboard on the code cell.
 */
import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/CopyButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusPill } from '@/components/common/StatusPill';
import { t, useTranslation } from '@/i18n';
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

function roleLabel(role: InviteRole): string {
  const map: Record<InviteRole, string> = {
    teacher: t('tenant_invitations.role_teacher'),
    assistant: t('tenant_invitations.role_assistant'),
    student: t('tenant_invitations.role_student'),
  };
  return map[role];
}

function pillTone(inv: Invitation): 'success' | 'warning' | 'neutral' {
  if (inv.accepted_at) return 'success';
  if (dayjs(inv.expires_at).isBefore(dayjs())) return 'warning';
  return 'neutral';
}

function pillLabel(inv: Invitation): string {
  if (inv.accepted_at) return t('tenant_invitations.status_used');
  if (dayjs(inv.expires_at).isBefore(dayjs())) return t('tenant_invitations.status_expired');
  return t('tenant_invitations.status_active');
}

export function TenantInvitationsPanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const listQ = useInvitations();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();

  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState<InviteRole>('student');
  const [email, setEmail] = useState('');
  const [courseId, setCourseId] = useState('');

  // Identity returns all invitations the caller can see (admin → all in
  // tenant); filter to the tenant we're viewing in case an admin opened
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
        // The panel always issues codes scoped to the tenant we are viewing —
        // admin (in tenant=system) can administer HSE / other tenants this way.
        tenant_id: tenantId,
      });
      notify.success(t('tenant_invitations.created'));
      setShowForm(false);
      setEmail('');
      setCourseId('');
      setRole('student');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('tenant_invitations.create_failed'));
    }
  };

  const onCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notify.success(t('tenant_invitations.code_copied', { code }));
    } catch {
      notify.error(t('tenant_invitations.copy_failed'));
    }
  };

  const onRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      notify.success(t('tenant_invitations.revoked'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? t('tenant_invitations.revoke_failed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(true)}
          data-testid="invitation-new-button"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('tenant_invitations.new')}
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tenant_invitations.create_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">{t('tenant_invitations.role_label')}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                <SelectTrigger id="inv-role" data-testid="invitation-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">{t('tenant_invitations.role_teacher')}</SelectItem>
                  <SelectItem value="assistant">{t('tenant_invitations.role_assistant')}</SelectItem>
                  <SelectItem value="student">{t('tenant_invitations.role_student')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">{t('tenant_invitations.email_label')}</Label>
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
              <Label htmlFor="inv-course">{t('tenant_invitations.course_label')}</Label>
              <Input
                id="inv-course"
                value={courseId}
                onChange={(e) => setCourseId(e.currentTarget.value)}
                placeholder="crs_..."
                data-testid="invitation-course-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={create.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={onSubmit}
              disabled={create.isPending}
              data-testid="invitation-create-submit"
            >
              {create.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : active.length === 0 && past.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tenant_invitations.empty')}</p>
      ) : (
        <div className="-mx-2">
          {active.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
              data-testid={`invitation-row-${inv.id}`}
            >
              <code
                className="cursor-pointer rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider hover:bg-muted/70"
                onClick={() => inv.code && onCopy(inv.code)}
                title={t('tenant_invitations.copy_code')}
              >
                {inv.code ?? '—'}
              </code>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {roleLabel(inv.role) ?? inv.role}
                  {inv.course_id && (
                    <span className="ml-1.5 text-muted-foreground">
                      {t('tenant_invitations.course_prefix', { courseId: inv.course_id })}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {inv.email || t('tenant_invitations.no_email')} · {t('tenant_invitations.until', { date: dayjs(inv.expires_at).format('D MMM HH:mm') })}
                </div>
              </div>
              <StatusPill tone={pillTone(inv)}>{pillLabel(inv)}</StatusPill>
              <div className="flex items-center gap-1">
                {inv.code && (
                  <CopyButton
                    value={inv.code}
                    label={t('tenant_invitations.copy_code')}
                    toastMessage={t('tenant_invitations.code_copied', { code: inv.code })}
                  />
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onRevoke(inv.id)}
                  disabled={revoke.isPending}
                  aria-label={t('tenant_invitations.revoke')}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {past.length > 0 && (
            <details className="pt-3">
              <summary className="cursor-pointer px-2 text-xs text-muted-foreground">
                {t('tenant_invitations.history', { count: past.length })}
              </summary>
              <div className="mt-1">
                {past.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2 text-xs text-muted-foreground"
                  >
                    <code className="rounded bg-muted/60 px-2 py-1 font-mono">{inv.code ?? '—'}</code>
                    <span className="min-w-0 flex-1 truncate">
                      {roleLabel(inv.role) ?? inv.role} · {inv.email || t('tenant_invitations.no_email')}
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
