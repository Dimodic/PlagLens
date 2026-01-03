/**
 * /settings — user-facing settings landing page (teacher / student).
 *
 * Kaggle-style document layout: each section starts with a small H2 and a
 * top border. No Card chrome; rows are flat, separated by hairline borders.
 *
 * NOTE: this is NOT the tenant/admin "Системные настройки" page. The deeper,
 * admin-only `/admin/system/settings` route lives at
 * `pages/admin/settings/SystemSettingsPage.tsx` and is unrelated.
 */
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useNotificationPreferences,
  useUpdatePreferences,
} from '@/hooks/api/useNotificationsApi';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Page, PageHeader, Section } from '@/components/layout/Page';

interface SectionRowProps {
  label: string;
  right?: React.ReactNode;
  /** Kept for the call sites, ignored now — see comment below. */
  isFirst?: boolean;
}

/** Row layout inside a settings section.
 *
 * Originally every row had a top border so the section read as a table.
 * That stacked on top of each section's own border (variant="document"),
 * producing the "лесенка" the user complained about. We rely purely on
 * vertical rhythm now — py-2.5 + parent gap — and let the labels sit on
 * a calm background. */
function SectionRow({ label, right }: SectionRowProps) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {label}
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
  isFirst?: boolean;
}

function ToggleRow({ label, value, onChange, testId }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {label}
      </div>
      <Switch checked={value} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

export default function UserSettingsLandingPage() {
  useDocumentTitle('Настройки');
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useNotifications();
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdatePreferences();
  const [, setLoadingChannel] = useState<string | null>(null);

  const channels = prefs?.channels_enabled ?? {
    inapp: true,
    email: true,
    telegram: false,
  };

  const setChannel = async (
    channel: 'inapp' | 'email' | 'telegram',
    enabled: boolean,
  ) => {
    setLoadingChannel(channel);
    try {
      await updatePrefs.mutateAsync({
        channels_enabled: { ...channels, [channel]: enabled },
      });
      notify.success('Сохранено');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setLoadingChannel(null);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title="Настройки" />

      <Section title="Учётная запись" variant="document">
        <SectionRow
          label="Имя"
          right={
            <span className="text-sm text-muted-foreground">
              {user?.display_name ?? '—'}
            </span>
          }
          isFirst
        />
        <SectionRow
          label="Локаль"
          right={
            <span className="text-sm text-muted-foreground">
              {user?.locale ?? 'ru'}
            </span>
          }
        />
        <SectionRow
          label="Часовой пояс"
          right={
            <span className="text-sm text-muted-foreground">
              {user?.timezone ?? 'Europe/Moscow'}
            </span>
          }
        />
        <SectionRow
          label="Последний вход"
          right={
            <span className="text-sm text-muted-foreground">
              {user?.last_login_at
                ? dayjs(user.last_login_at).format('DD.MM.YYYY HH:mm')
                : '—'}
            </span>
          }
        />
        <div className="pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/me/profile')}
          >
            Открыть профиль
          </Button>
        </div>
      </Section>

      <Section title="Рабочее пространство" variant="document">
        <SectionRow
          label="Организация"
          right={
            <span className="text-sm text-muted-foreground">
              {user?.tenant?.name ?? '—'}
            </span>
          }
          isFirst
        />
        <SectionRow
          label="Роль"
          right={
            <span className="text-sm text-muted-foreground">
              {user?.global_role ?? '—'}
            </span>
          }
        />
      </Section>

      <Section title="Уведомления" variant="document">
        <ToggleRow
          label="In-app"
          value={channels.inapp}
          onChange={(v) => setChannel('inapp', v)}
          testId="settings-toggle-inapp"
          isFirst
        />
        <ToggleRow
          label="Email"
          value={channels.email}
          onChange={(v) => setChannel('email', v)}
          testId="settings-toggle-email"
        />
        <ToggleRow
          label="Telegram"
          value={channels.telegram}
          onChange={(v) => setChannel('telegram', v)}
          testId="settings-toggle-telegram"
        />
      </Section>

      <Section title="Приватность" variant="document">
        <SectionRow
          label="Анонимизация студентов в отчётах"
          right={
            <span className="text-sm text-muted-foreground">по умолчанию</span>
          }
          isFirst
        />
        <SectionRow
          label="Срок хранения отчётов"
          right={
            <span className="text-sm text-muted-foreground">политика тенанта</span>
          }
        />
        <div className="pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/me/exports')}
          >
            Открыть экспорт
          </Button>
        </div>
      </Section>
    </Page>
  );
}
