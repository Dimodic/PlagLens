/**
 * AddMembersDialog — one modal, four ways to add people to a course. Replaces
 * the old four-item «Добавить» dropdown (which opened four separate dialogs and
 * was opaque to teachers). Methods are tabs with a one-line «зачем»:
 *
 *   • Код    — one course code to share with a whole group
 *   • Поиск  — find an existing platform user by name/email and add directly
 *   • Email  — paste a list of emails → send invitations (async)
 *   • Я.Контест — claim codes per imported contest participant (tab shown ONLY
 *                 when the course actually has imported contest participants)
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/CopyButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAddMember, useBulkInvite } from '@/hooks/api/useCourses';
import { useBulkBindings } from '@/hooks/api/useInvitations';
import { useExternalParticipants } from '@/hooks/api/useSubmissions';
import { useUsers } from '@/hooks/api/useUsers';
import { invitationsApi, type BulkBindingItem } from '@/api/endpoints/invitations';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import { parseProblem } from '@/api/problem';

type Role = 'student' | 'assistant';
type Method = 'code' | 'search' | 'email' | 'contest';

/** Build a `ФИО,Код` CSV from minted codes and trigger a download. */
function downloadCodesCsv(items: BulkBindingItem[], header: string): void {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    header,
    ...items.map((it) => `${esc(it.display_name ?? it.external_id)},${esc(it.code)}`),
  ];
  const blob = new Blob(['﻿' + rows.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yandex-contest-codes.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the async-operation id after an email invite, so the parent
   *  members list can show the progress strip. */
  onOperation?: (opId: string) => void;
}

export function AddMembersDialog({ courseId, open, onOpenChange, onOperation }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();

  const [method, setMethod] = useState<Method>('code');
  const [role, setRole] = useState<Role>('student');

  // ---- search (replaces the old "add by usr_… id") ----
  const [q, setQ] = useState('');
  const usersQ = useUsers(
    { q: q.trim() || undefined, limit: 20 },
    { enabled: open && q.trim().length >= 2 },
  );
  const users = usersQ.data?.data ?? [];
  const addMember = useAddMember(courseId);
  const handleAdd = async (userId: string) => {
    try {
      await addMember.mutateAsync({ user_id: userId, role });
      notify.success(t('members_panel.member_added'));
    } catch (e) {
      notify.error(parseProblem(e).detail || t('members_panel.code_create_error'));
    }
  };

  // ---- email list ----
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const bulkInvite = useBulkInvite(courseId);
  const handleEmail = async () => {
    const list = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
      setEmailErr(t('members_panel.bulk_emails_required'));
      return;
    }
    setEmailErr(null);
    try {
      const op = await bulkInvite.mutateAsync({
        emails: list,
        role,
        message: message || undefined,
      });
      notify.info(t('members_panel.inviting_count', { count: list.length }));
      onOperation?.(op.id);
      close();
    } catch (e) {
      notify.error(parseProblem(e).detail || t('members_panel.code_create_error'));
    }
  };

  // ---- one course code ----
  const [code, setCode] = useState<string | null>(null);
  const createCode = useMutation({
    mutationFn: () => invitationsApi.create({ role, course_id: courseId }),
    onSuccess: (inv) => setCode(inv.code ?? null),
    onError: (e) =>
      notify.error(parseProblem(e).detail || t('members_panel.code_create_error')),
  });

  // ---- Я.Контест claim codes (tab only shown when participants exist) ----
  const participants = useExternalParticipants(courseId, { enabled: open });
  const hasContest = (participants.data?.length ?? 0) > 0;
  const bulkBindings = useBulkBindings();
  const ycItems = bulkBindings.data?.items ?? null;
  const genYc = () => {
    const list = participants.data ?? [];
    if (list.length === 0) return;
    bulkBindings.mutate(
      {
        course_id: courseId,
        participants: list.map((p) => ({
          external_id: p.external_id,
          display_name: p.display_name,
        })),
      },
      {
        onError: (e) =>
          notify.error(parseProblem(e).detail || t('members_panel.codes_create_error')),
      },
    );
  };

  function close() {
    setQ('');
    setEmails('');
    setMessage('');
    setEmailErr(null);
    setCode(null);
    setMethod('code');
    bulkBindings.reset();
    onOpenChange(false);
  }

  const roleSelect = (id: string) => (
    <Select value={role} onValueChange={(v) => setRole(v as Role)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="student">{t('members_panel.role_student')}</SelectItem>
        <SelectItem value="assistant">{t('members_panel.role_assistant')}</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('members_panel.add_people_title')}</DialogTitle>
        </DialogHeader>

        <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
          <TabsList>
            <TabsTrigger value="code" data-testid="add-method-code">
              {t('members_panel.method_code')}
            </TabsTrigger>
            <TabsTrigger value="search" data-testid="add-method-search">
              {t('members_panel.method_search')}
            </TabsTrigger>
            <TabsTrigger value="email" data-testid="add-method-email">
              {t('members_panel.method_email')}
            </TabsTrigger>
            {hasContest && (
              <TabsTrigger value="contest" data-testid="add-method-contest">
                {t('members_panel.method_contest')}
              </TabsTrigger>
            )}
          </TabsList>

          {/* ---- CODE ---- */}
          <TabsContent value="code" className="space-y-4 pt-4">
            {code ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-lg font-semibold tracking-wider"
                    data-testid="course-members-code-value"
                  >
                    {code}
                  </code>
                  <CopyButton value={code} toastMessage={t('members_panel.copied')} />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCode(null)}>
                    {t('members_panel.create_more')}
                  </Button>
                  <Button onClick={close}>{t('members_panel.done')}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="add-code-role">{t('members_panel.role_label')}</Label>
                  {roleSelect('add-code-role')}
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    onClick={() => createCode.mutate()}
                    disabled={createCode.isPending}
                    data-testid="course-members-code-create"
                  >
                    {createCode.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('members_panel.code_create')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ---- SEARCH ---- */}
          <TabsContent value="search" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-search-role">{t('members_panel.role_label')}</Label>
              {roleSelect('add-search-role')}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                placeholder={t('members_panel.search_user_placeholder')}
                className="pl-9"
                data-testid="add-member-search"
              />
            </div>
            {q.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">{t('members_panel.search_min')}</p>
            ) : usersQ.isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('members_panel.search_none')}</p>
            ) : (
              <div className="max-h-[40vh] divide-y divide-border/60 overflow-y-auto">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-2">
                    <Avatar className="h-8 w-8 flex-none">
                      <AvatarFallback className="text-xs">
                        {(u.display_name || 'U').slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.display_name || '—'}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdd(u.id)}
                      disabled={addMember.isPending}
                      data-testid={`add-member-${u.id}`}
                    >
                      {t('members_panel.add')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ---- EMAIL ---- */}
          <TabsContent value="email" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-email-role">{t('members_panel.role_label')}</Label>
              {roleSelect('add-email-role')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-emails">{t('members_panel.emails_label')}</Label>
              <Textarea
                id="add-emails"
                rows={5}
                value={emails}
                onChange={(e) => setEmails(e.currentTarget.value)}
                aria-invalid={!!emailErr}
                data-testid="add-emails"
              />
              <p className="text-xs text-muted-foreground">{t('members_panel.emails_hint')}</p>
              {emailErr && <p className="text-sm text-destructive">{emailErr}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-msg">{t('members_panel.message_label')}</Label>
              <Textarea
                id="add-msg"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.currentTarget.value)}
              />
            </div>
            <div className="flex items-center justify-end">
              <Button
                onClick={handleEmail}
                disabled={bulkInvite.isPending}
                data-testid="add-email-submit"
              >
                {bulkInvite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('members_panel.send')}
              </Button>
            </div>
          </TabsContent>

          {/* ---- Я.КОНТЕСТ ---- */}
          {hasContest && (
            <TabsContent value="contest" className="space-y-4 pt-4">
              {ycItems ? (
                <div className="space-y-3" data-testid="course-members-yc-result">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t('members_panel.yc_ready_count', { count: ycItems.length })}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const blob = ycItems
                            .map((it) => `${it.display_name ?? it.external_id}\t${it.code}`)
                            .join('\n');
                          void navigator.clipboard?.writeText(blob);
                          notify.info(t('members_panel.copied'));
                        }}
                      >
                        {t('members_panel.copy_all')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadCodesCsv(ycItems, t('members_panel.csv_header'))}
                      >
                        <Download className="mr-2 h-3.5 w-3.5" />
                        {t('members_panel.download_csv')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex max-h-[40vh] flex-col divide-y divide-border/60 overflow-y-auto">
                    {ycItems.map((it) => (
                      <div key={it.external_id} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {it.display_name ?? it.external_id}
                        </span>
                        <code className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-sm tracking-wider">
                          {it.code}
                        </code>
                        <CopyButton
                          value={it.code}
                          toastMessage={t('members_panel.copied')}
                          className="h-7 w-7"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-end">
                    <Button onClick={close}>{t('members_panel.done')}</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-foreground">
                    {t('members_panel.yc_unbound_count', {
                      count: participants.data?.length ?? 0,
                    })}
                  </p>
                  <div className="flex items-center justify-end">
                    <Button
                      onClick={genYc}
                      disabled={bulkBindings.isPending}
                      data-testid="course-members-yc-create"
                    >
                      {bulkBindings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('members_panel.yc_create')}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default AddMembersDialog;
