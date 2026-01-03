/**
 * PreferencesPage — channels enabled, digest frequency, quiet hours,
 * per-event matrix.
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Page, PageHeader } from '@/components/layout/Page';
import { PreferencesMatrix } from '@/components/notifications/PreferencesMatrix';
import {
  useAvailableEvents,
  useNotificationPreferences,
  usePerEventPreferences,
  useResetPreferences,
  useTestNotification,
  useUpdatePerEventPreferences,
  useUpdatePreferences,
} from '@/hooks/api/useNotificationsApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import type {
  ChannelsEnabled,
  DigestFrequency,
  NotificationChannel,
  PerEventPreferences,
} from '@/api/endpoints/notifications';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function PreferencesPage() {
  useDocumentTitle('Настройки уведомлений');
  const prefs = useNotificationPreferences();
  const perEvent = usePerEventPreferences();
  const events = useAvailableEvents();
  const update = useUpdatePreferences();
  const updatePerEvent = useUpdatePerEventPreferences();
  const reset = useResetPreferences();
  const test = useTestNotification();
  const notify = useNotifications();

  const [channels, setChannels] = useState<ChannelsEnabled>({
    inapp: true,
    email: true,
    telegram: false,
  });
  const [digest, setDigest] = useState<DigestFrequency>('instant');
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');
  const [tz, setTz] = useState('');
  const [matrix, setMatrix] = useState<PerEventPreferences>({});

  // Hydrate when data loads
  useEffect(() => {
    if (prefs.data) {
      setChannels(prefs.data.channels_enabled);
      setDigest(prefs.data.email_digest_frequency);
      setQuietStart(prefs.data.quiet_hours_start ?? '');
      setQuietEnd(prefs.data.quiet_hours_end ?? '');
      setTz(prefs.data.timezone ?? '');
    }
  }, [prefs.data]);

  useEffect(() => {
    if (perEvent.data) setMatrix(perEvent.data);
  }, [perEvent.data]);

  const save = () => {
    update.mutate(
      {
        channels_enabled: channels,
        email_digest_frequency: digest,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
        timezone: tz || null,
      },
      {
        onSuccess: () => notify.success('Сохранено'),
        onError: (p) =>
          notify.error((p as unknown as Problem).title || 'Не удалось сохранить'),
      },
    );
    updatePerEvent.mutate(matrix);
  };

  const onTest = (channel: NotificationChannel) => {
    test.mutate(
      { channel, template: 'test' },
      {
        onSuccess: (r) =>
          r.delivered
            ? notify.success(`Тестовое отправлено (${channel})`)
            : notify.error(`Не удалось отправить (${channel})`),
        onError: (p) =>
          notify.error((p as unknown as Problem).title || 'Ошибка теста'),
      },
    );
  };

  if (prefs.isLoading || events.isLoading) {
    return (
      <Page width="narrow">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader title="Уведомления" />
      <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Каналы</h2>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ch-inapp"
                      checked={channels.inapp}
                      onCheckedChange={(v) =>
                        setChannels({ ...channels, inapp: v })
                      }
                      data-testid="ch-inapp"
                    />
                    <Label htmlFor="ch-inapp">In-app</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ch-email"
                      checked={channels.email}
                      onCheckedChange={(v) =>
                        setChannels({ ...channels, email: v })
                      }
                      data-testid="ch-email"
                    />
                    <Label htmlFor="ch-email">Email</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ch-telegram"
                      checked={channels.telegram}
                      onCheckedChange={(v) =>
                        setChannels({ ...channels, telegram: v })
                      }
                      data-testid="ch-telegram"
                    />
                    <Label htmlFor="ch-telegram">Telegram</Label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTest('inapp')}
                    data-testid="test-inapp"
                  >
                    Тест in-app
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTest('email')}
                    data-testid="test-email"
                  >
                    Тест email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTest('telegram')}
                    data-testid="test-telegram"
                  >
                    Тест telegram
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Дайджест и тишина</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="digest-select">Частота email-дайджеста</Label>
                  <Select
                    value={digest}
                    onValueChange={(v) => v && setDigest(v as DigestFrequency)}
                  >
                    <SelectTrigger id="digest-select" data-testid="digest-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Мгновенно</SelectItem>
                      <SelectItem value="hourly">Раз в час</SelectItem>
                      <SelectItem value="daily">Раз в день</SelectItem>
                      <SelectItem value="never">Никогда</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quiet-start">
                      Тихие часы — начало (HH:MM)
                    </Label>
                    <Input
                      id="quiet-start"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.currentTarget.value)}
                      placeholder="22:00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quiet-end">
                      Тихие часы — конец (HH:MM)
                    </Label>
                    <Input
                      id="quiet-end"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.currentTarget.value)}
                      placeholder="08:00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prefs-tz">Часовой пояс</Label>
                  <Input
                    id="prefs-tz"
                    value={tz}
                    onChange={(e) => setTz(e.currentTarget.value)}
                    placeholder="Europe/Moscow"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <h2 className="text-base font-semibold tracking-tight">Матрица событий</h2>
                <PreferencesMatrix
                  events={events.data ?? []}
                  value={matrix}
                  onChange={setMatrix}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
              data-testid="reset-btn"
            >
              {reset.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сбросить к дефолту
            </Button>
            <Button
              onClick={save}
              disabled={update.isPending || updatePerEvent.isPending}
              data-testid="save-btn"
            >
              {(update.isPending || updatePerEvent.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </div>
        </div>
    </Page>
  );
}
