/**
 * /me/profile — current user's profile + all personal settings.
 *
 * One narrow column, no card chrome (.claude/UI_RULES.md). Sections:
 *   1. Аватар         — replace / remove (drag-drop ANYWHERE on the page)
 *   2. Личные данные  — email + display name + Сохранить
 *   3. Уведомления    — 3 channel switches
 *   4. Безопасность   — password / 2FA / OAuth / sessions
 *
 * The invite-code redeem panel lives on the home dashboard
 * («+ Присоединиться»), not here — it used to be duplicated.
 */
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { PasswordSection } from '@/components/me/security/PasswordSection';
import { TwoFactorSection } from '@/components/me/security/TwoFactorSection';
import { OAuthLinksSection } from '@/components/me/security/OAuthLinksSection';
import { SessionsSection } from '@/components/me/security/SessionsSection';
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
import { emailChannelHint } from '@/auth/userIdentity';
import { useTranslation } from '@/i18n';
import { initials } from '@/utils/initials';
import type { Problem } from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

export function ProfilePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('profile.document_title'));
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const update = useUpdateMe();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const prefsQ = useNotificationPreferences();
  const prefsM = useUpdatePreferences();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.display_name);
      setEmail(user.email ?? '');
    }
  }, [user]);

  const handleSave = async () => {
    setProblem(null);
    try {
      await update.mutateAsync({ display_name: name, email });
      notify.success(t('profile.notify_saved'));
      await reloadMe();
    } catch (e) {
      setProblem(e as Problem);
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
      notify.error((e as Problem)?.detail ?? t('profile.notify_failed'));
    }
  };

  const handleUpload = async (file: File) => {
    if (file.size > MAX_AVATAR_SIZE) {
      notify.error(t('profile.avatar_too_large'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify.error(t('profile.avatar_images_only'));
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      await upload.mutateAsync(formData);
      notify.success(t('profile.avatar_uploaded'));
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('profile.avatar_upload_failed'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    if (e.target) e.target.value = '';
  };

  // Whole-page drag & drop — the entire profile screen is a drop target, not
  // just a small box. Window-level listeners + a drag-depth counter (enter /
  // leave fire per nested element) keep the overlay from flickering.
  const handleUploadRef = useRef(handleUpload);
  handleUploadRef.current = handleUpload;
  const dragDepth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void handleUploadRef.current(file);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const handleDelete = async () => {
    try {
      await remove.mutateAsync();
      notify.success(t('profile.avatar_removed'));
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('profile.notify_failed'));
    }
  };

  return (
    <Page width="narrow">
      {/* Whole-screen drop overlay while an image is dragged anywhere. */}
      {dragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/60 px-12 py-10">
            <Upload className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">
              {t('profile.avatar_drop_overlay')}
            </p>
          </div>
        </div>
      )}

      <PageHeader title={t('profile.document_title')} />

      {problem && <ProblemAlert problem={problem} />}

      {/* Avatar — flat row. Drag-drop is wired at the page level (above), so
          the row itself is just the picture + the replace / remove buttons. */}
      <section className="flex items-center gap-5">
        <Avatar className="h-20 w-20">
          {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
          <AvatarFallback className="text-base">
            {initials(user?.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1.5">
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
              ) : (
                <ImageIcon className="mr-2 h-3.5 w-3.5" />
              )}
              {user?.avatar_url
                ? t('profile.avatar_replace')
                : t('profile.avatar_upload')}
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
                {t('profile.avatar_remove')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground pl-1">
            {t('profile.avatar_hint')}
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
          {t('profile.personal_heading')}
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">{t('profile.email_label')}</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder={t('profile.email_placeholder')}
            data-testid="profile-email-input"
          />
          {user?.email_is_placeholder && user?.external_handle && (
            <p className="text-xs text-muted-foreground">
              {t('profile.telegram_login_prefix')}{' '}
              <span className="font-mono">@{user.external_handle}</span>
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-display-name">{t('profile.name_label')}</Label>
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
            {t('profile.save')}
          </Button>
        </div>
      </section>

      {/* Уведомления — каналы доставки. Язык переехал в меню профиля. */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t('prefs.notifications_label')}
        </h2>
        <div className="space-y-0">
          <ChannelRow
            label={t('prefs.channel_inapp')}
            hint={t('prefs.channel_inapp_hint')}
            value={channels.inapp}
            onChange={(v) => setChannel('inapp', v)}
            testId="profile-notif-inapp"
          />
          <ChannelRow
            label="Email"
            hint={emailChannelHint(user)}
            value={channels.email}
            onChange={(v) => setChannel('email', v)}
            testId="profile-notif-email"
          />
          <ChannelRow
            label="Telegram"
            hint={
              user?.linked_oauth?.includes('telegram')
                ? user.external_handle
                  ? `@${user.external_handle}`
                  : t('prefs.channel_telegram_linked')
                : t('prefs.channel_telegram_link_hint')
            }
            value={channels.telegram}
            onChange={(v) => setChannel('telegram', v)}
            testId="profile-notif-telegram"
          />
        </div>
      </section>

      {/* Безопасность */}
      <section className="border-t border-border/50 pt-6 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t('profile.security_heading')}
        </h2>
        {/* No hairlines between sub-sections — the sub-headings + whitespace
            carry the structure. The ladder of dividers read as cluttered. */}
        <div className="space-y-7">
          <PasswordSection />
          <TwoFactorSection />
          <OAuthLinksSection />
          <SessionsSection />
        </div>
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
    <div className="flex items-center gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{label}</div>
        {hint && (
          <div className="text-xs text-muted-foreground truncate">{hint}</div>
        )}
      </div>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        className="scale-[0.8] data-[state=checked]:bg-primary/80"
        data-testid={testId}
      />
    </div>
  );
}

export default ProfilePage;
