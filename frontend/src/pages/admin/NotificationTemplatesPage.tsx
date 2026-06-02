/**
 * /admin/notifications/templates — list templates with edit modal.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useNotificationTemplates,
  useUpdateTemplate,
} from '@/hooks/api/useNotificationsAdmin';
import type {
  DeliveryChannel,
  NotificationTemplate,
} from '@/api/endpoints/notificationsAdmin';
import type { Problem } from '@/api/types';

interface EditTemplateModalProps {
  template: NotificationTemplate | null;
  opened: boolean;
  onClose: () => void;
}

function EditTemplateModal({
  template,
  opened,
  onClose,
}: EditTemplateModalProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const updateM = useUpdateTemplate();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (template) {
      setSubject(template.subject ?? '');
      setBody(template.body);
      setActive(template.active);
    }
  }, [template]);

  if (!template) return null;

  const handleSave = async () => {
    try {
      await updateM.mutateAsync({
        id: template.id,
        body: { subject: subject || null, body, active },
      });
      notify.success(t('notif_templates.saved'));
      onClose();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('notif_templates.save_failed'));
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{`${template.event_type} · ${template.channel} · ${template.locale}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {template.channel === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="template-subject">Subject</Label>
              <Input
                id="template-subject"
                value={subject}
                onChange={(e) => setSubject(e.currentTarget.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="template-body">Body</Label>
            <Textarea
              id="template-body"
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              rows={12}
              className="font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="template-active" checked={active} onCheckedChange={(v) => setActive(v)} />
            <Label htmlFor="template-active">Active</Label>
          </div>
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs text-muted-foreground">Preview</p>
              {subject && <p className="text-sm font-semibold">{subject}</p>}
              <p className="text-sm whitespace-pre-wrap">{body}</p>
            </CardContent>
          </Card>
          <div className="flex items-center justify-end">
            <Button onClick={handleSave} disabled={updateM.isPending}>
              {updateM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NotificationTemplatesPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('notif_templates.title'));
  const [eventType, setEventType] = useState('');
  const [channel, setChannel] = useState<DeliveryChannel | null>(null);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);

  const { data, isLoading, error } = useNotificationTemplates({
    event_type: eventType || undefined,
    channel: channel ?? undefined,
    limit: 100,
  });

  return (
    <Page width="wide">
      <PageHeader title={t('notif_templates.title')} />

      <div className="flex items-center gap-3">
        <Input
          placeholder="event_type"
          value={eventType}
          onChange={(e) => setEventType(e.currentTarget.value)}
          className="max-w-md"
        />
        <Select
          value={channel ?? 'all'}
          onValueChange={(v) =>
            setChannel(v === 'all' ? null : (v as DeliveryChannel))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('notif_templates.all_channels')}</SelectItem>
            <SelectItem value="email">email</SelectItem>
            <SelectItem value="telegram">telegram</SelectItem>
            <SelectItem value="in_app">in_app</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title={t('notif_templates.empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Locale</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((t) => (
                  <TableRow key={t.id} data-testid={`template-row-${t.id}`}>
                    <TableCell>
                      <span className="text-xs font-mono">{t.event_type}</span>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone="neutral">{t.channel}</StatusPill>
                    </TableCell>
                    <TableCell>{t.locale}</TableCell>
                    <TableCell>
                      <span className="block max-w-[260px] truncate text-xs">
                        {t.subject ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={t.active ? 'success' : 'neutral'}>
                        {t.active ? 'active' : 'off'}
                      </StatusPill>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(t)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <EditTemplateModal
        template={editing}
        opened={editing != null}
        onClose={() => setEditing(null)}
      />
    </Page>
  );
}

export default NotificationTemplatesPage;
