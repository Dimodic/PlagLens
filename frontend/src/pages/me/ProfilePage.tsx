/**
 * /me/profile — current user's profile (open layout).
 *
 * Open document layout per .claude/UI_RULES.md — no `Section variant="document"`
 * wrappers, no `Card` chrome. Sections separate themselves with hairline
 * dividers (h-px border-t) only when they need to.
 *
 * Locale lives in the topbar avatar dropdown — the admin doesn't touch it
 * from here; the user picks it globally. Timezone is dropped (defaults are
 * fine, no real consumer in the UI yet). Password change lives on
 * /me/security alongside 2FA and sessions; this page just offers a quick
 * link there.
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
import { useAuth } from '@/auth/useAuth';
import type { Problem } from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

export function ProfilePage() {
  useDocumentTitle('Профиль');
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const update = useUpdateMe();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragReject, setDragReject] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.display_name);
    }
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
    if (file) {
      void handleUpload(file);
    }
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

      {/* Avatar block */}
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
          <AvatarFallback>
            {user?.display_name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={
              'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 transition-colors ' +
              (dragReject
                ? 'border-destructive bg-destructive/5 text-destructive'
                : dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-foreground/30')
            }
          >
            {upload.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : dragReject ? (
              <X className="h-5 w-5" />
            ) : dragActive ? (
              <Upload className="h-5 w-5" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex flex-col">
              <span className="text-sm">Загрузить аватар</span>
              <span className="text-xs text-muted-foreground">PNG/JPG до 2 МБ</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            onChange={handleFileChange}
          />
          {user?.avatar_url && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive self-start"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-3.5 w-3.5" />
              )}
              Удалить аватар
            </Button>
          )}
        </div>
      </div>

      {/* Личные данные — open layout, single hairline above. */}
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

      {/* Безопасность — link out, no inline form. */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Безопасность
        </h2>
        <p className="text-sm text-muted-foreground">
          Пароль, двухфакторная аутентификация, привязанные OAuth-провайдеры
          и активные сессии — в одном месте.
        </p>
        <Button asChild variant="outline" data-testid="profile-security-link">
          <Link to="/me/security">Открыть «Безопасность» →</Link>
        </Button>
      </section>

      {/* Код приглашения — open, no card. */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Код приглашения
        </h2>
        <RedeemInvitePanel />
      </section>
    </Page>
  );
}

export default ProfilePage;
