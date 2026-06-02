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
import { useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
  useDocumentTitle(t('preferences_page.document_title'));
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
        onSuccess: () => notify.success(t('preferences_page.notify_saved')),
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).title ||
              t('preferences_page.notify_save_failed'),
          ),
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
            ? notify.success(
                t('preferences_page.notify_test_sent', { channel }),
              )
            : notify.error(
                t('preferences_page.notify_test_failed', { channel }),
              ),
        onError: (p) =>
          notify.error(
            (p as unknown as Problem).title ||
              t('preferences_page.notify_test_error'),
          ),
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
      <PageHeader title={t('preferences_page.page_title')} />
      <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <h2 className="text-xl font-bold">
                  {t('preferences_page.channels_heading')}
                </h2>
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
                    {t('preferences_page.test_inapp')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTest('email')}
                    data-testid="test-email"
                  >
                    {t('preferences_page.test_email')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTest('telegram')}
                    data-testid="test-telegram"
                  >
                    {t('preferences_page.test_telegram')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <h2 className="text-xl font-bold">
                  {t('preferences_page.digest_quiet_heading')}
                </h2>
                <div className="space-y-1.5">
                  <Label htmlFor="digest-select">
                    {t('preferences_page.digest_frequency_label')}
                  </Label>
                  <Select
                    value={digest}
                    onValueChange={(v) => v && setDigest(v as DigestFrequency)}
                  >
                    <SelectTrigger id="digest-select" data-testid="digest-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">
                        {t('preferences_page.digest_instant')}
                      </SelectItem>
                      <SelectItem value="hourly">
                        {t('preferences_page.digest_hourly')}
                      </SelectItem>
                      <SelectItem value="daily">
                        {t('preferences_page.digest_daily')}
                      </SelectItem>
                      <SelectItem value="never">
                        {t('preferences_page.digest_never')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quiet-start">
                      {t('preferences_page.quiet_start_label')}
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
                      {t('preferences_page.quiet_end_label')}
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
                  <Label htmlFor="prefs-tz">
                    {t('preferences_page.timezone_label')}
                  </Label>
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
                <h2 className="text-base font-semibold tracking-tight">
                  {t('preferences_page.event_matrix_heading')}
                </h2>
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
              {t('preferences_page.reset_button')}
            </Button>
            <Button
              onClick={save}
              disabled={update.isPending || updatePerEvent.isPending}
              data-testid="save-btn"
            >
              {(update.isPending || updatePerEvent.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('preferences_page.save_button')}
            </Button>
          </div>
        </div>
    </Page>
  );
}
