/**
 * /me/profile — current user's profile + all personal settings.
 *
 * Single landing surface per .claude/UI_RULES.md:
 *   - One narrow column. No card chrome. Sections separate themselves
 *     with a single hairline (border-t border-border/50 pt-6).
 *   - All «общие настройки» live HERE — there is no separate /settings
 *     page any more. The four sections, in reading order:
 *
 *       1. Аватар         — replace / remove
 *       2. Личные данные  — email (readonly) + display name + Сохранить
 *       3. Предпочтения   — Язык (RU / EN segmented) + Уведомления (3 свича)
 *       4. Безопасность   — single link out to /me/security
 *       5. Код приглашения — flat input
 *
 * Locale persists via PATCH /users/me; channel toggles via
 * PATCH /notifications/preferences. Both writes are fire-and-forget for the
 * UI's responsiveness — the worst case is a re-pick after a reload.
 */
import { Image as ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { RedeemInvitePanel } from '@/components/common/RedeemInvitePanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDeleteAvatar,
  useUpdateMe,
  useUploadAvatar,
} from '@/hooks/api/useUsers';
import {
  useNotificationPreferences,
  useUpdatePreferences,
} from '@/hooks/api/useNotificationsApi';
import { useAuth } from '@/auth/useAuth';
import { useTranslation, type Locale } from '@/i18n';
import type { Problem } from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/components/ui/utils';

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

export function ProfilePage() {
  useDocumentTitle('Профиль');
  const { user, reloadMe } = useAuth();
  const { locale, setLocale } = useTranslation();
  const notify = useNotifications();
  const update = useUpdateMe();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const prefsQ = useNotificationPreferences();
  const prefsM = useUpdatePreferences();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragReject, setDragReject] = useState(false);

  useEffect(() => {
    if (user) setName(user.display_name);
  }, [user]);

  const handleSave = async () => {
    setProblem(null);
    try {
      await update.mutateAsync({ display_name: name });
      notify.success('Сохранено');
      await reloadMe();
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  const handleLocale = async (next: Locale) => {
    if (next === locale) return;
    setLocale(next); // instant UI swap
    try {
      await update.mutateAsync({ locale: next });
      await reloadMe();
    } catch {
      /* non-fatal — local swap already happened */
    }
  };

  const channels = prefsQ.data?.channels_enabled ?? {
    inapp: true,
    email: true,
    telegram: false,
  };

  const setChannel = async (
    channel: 'inapp' | 'email' | 'telegram',
    enabled: boolean,
  ) => {
    try {
      await prefsM.mutateAsync({
        channels_enabled: { ...channels, [channel]: enabled },
      });
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleUpload = async (file: File) => {
    if (file.size > MAX_AVATAR_SIZE) {
      notify.error('Файл больше 2 МБ');
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify.error('Допустимы только изображения');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      await upload.mutateAsync(formData);
      notify.success('Аватар загружен');
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось загрузить');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    if (e.target) e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setDragReject(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const item = e.dataTransfer.items?.[0];
    if (item && !item.type.startsWith('image/')) {
      setDragReject(true);
      setDragActive(false);
    } else {
      setDragActive(true);
      setDragReject(false);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setDragReject(false);
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync();
      notify.success('Аватар удалён');
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title="Профиль" />

      {problem && <ProblemAlert problem={problem} />}

      {/* Avatar — flat row, no dashed dropbox chrome. Drag-drop is still
          wired but the visible affordance is a single text button so the
          page stops shouting at the user from the first scroll. */}
      <section className="flex items-center gap-5">
        <Avatar className="h-20 w-20">
          {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
          <AvatarFallback className="text-base">
            {(user?.display_name ?? '').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col gap-1.5 rounded-md px-1 py-1 transition-colors',
            dragReject && 'bg-destructive/10',
            dragActive && !dragReject && 'bg-muted/40',
          )}
        >
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
              data-testid="profile-avatar-upload"
            >
              {upload.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : dragReject ? (
                <X className="mr-2 h-3.5 w-3.5" />
              ) : dragActive ? (
                <Upload className="mr-2 h-3.5 w-3.5" />
              ) : (
                <ImageIcon className="mr-2 h-3.5 w-3.5" />
              )}
              {user?.avatar_url ? 'Заменить' : 'Загрузить аватар'}
            </Button>
            {user?.avatar_url && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={remove.isPending}
                className="text-muted-foreground hover:text-destructive"
                data-testid="profile-avatar-remove"
              >
                {remove.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                )}
                Удалить
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground pl-1">
            PNG / JPG, до 2 МБ. Можно перетащить файл сюда.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </section>

      {/* Личные данные */}
      <section className="space-y-4 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Личные данные
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            value={user?.email ?? ''}
            disabled
            data-testid="profile-email-readonly"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-display-name">Имя</Label>
          <Input
            id="profile-display-name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-testid="profile-display-name-input"
          />
        </div>
        <div>
          <Button
            onClick={handleSave}
            disabled={update.isPending}
            data-testid="profile-save-button"
          >
            {update.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Сохранить
          </Button>
        </div>
      </section>

      {/* Предпочтения — locale + notification channels in one place. */}
      <section className="space-y-5 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Предпочтения
        </h2>

        {/* Language as a segmented control — two equal-width pills, the
            picked one inverts. Simpler than a Select for two options. */}
        <div className="space-y-2">
          <Label className="text-sm font-normal text-foreground">Язык</Label>
          <div
            className="inline-flex rounded-md border border-border p-0.5"
            data-testid="profile-locale-segmented"
          >
            {(['ru', 'en'] as const).map((code) => {
              const active = locale === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleLocale(code)}
                  data-testid={`profile-locale-${code}`}
                  className={cn(
                    'px-4 h-8 text-sm rounded transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {code === 'ru' ? 'Русский' : 'English'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notification channels — flat list, no card. */}
        <div className="space-y-2">
          <Label className="text-sm font-normal text-foreground">
            Уведомления
          </Label>
          <div className="space-y-0">
            <ChannelRow
              label="В браузере"
              hint="Колокольчик в шапке и страница «Уведомления»"
              value={channels.inapp}
              onChange={(v) => setChannel('inapp', v)}
              testId="profile-notif-inapp"
            />
            <ChannelRow
              label="Email"
              hint={user?.email ?? undefined}
              value={channels.email}
              onChange={(v) => setChannel('email', v)}
              testId="profile-notif-email"
            />
            <ChannelRow
              label="Telegram"
              hint="После привязки Telegram в разделе «Безопасность»"
              value={channels.telegram}
              onChange={(v) => setChannel('telegram', v)}
              testId="profile-notif-telegram"
            />
          </div>
        </div>
      </section>

      {/* Безопасность — single link, no extra paragraph noise. */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Безопасность
        </h2>
        <Button asChild variant="outline" data-testid="profile-security-link">
          <Link to="/me/security">
            Пароль, 2FA, OAuth-провайдеры, сессии →
          </Link>
        </Button>
      </section>

      {/* Код приглашения */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Код приглашения
        </h2>
        <RedeemInvitePanel />
      </section>
    </Page>
  );
}

interface ChannelRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}

function ChannelRow({ label, hint, value, onChange, testId }: ChannelRowProps) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{label}</div>
        {hint && (
          <div className="text-xs text-muted-foreground truncate">{hint}</div>
        )}
      </div>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}

export default ProfilePage;
