/**
 * Inline 2FA block for /me/profile.
 *
 * Compact row by default: title + state + single action button on the
 * right. Clicking «Включить 2FA» starts the enroll flow inline; the
 * form (otpauth URI + 6-digit code input) drops below the row. Disabling
 * 2FA exposes a single password field + button — same row pattern.
 */
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useDisable2FA,
  useEnable2FA,
  useEnroll2FA,
} from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/auth/useAuth';
import { cn } from '@/components/ui/utils';
import type { Problem } from '@/api/types';

export function TwoFactorSection() {
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const enroll = useEnroll2FA();
  const enable = useEnable2FA();
  const disable = useDisable2FA();
  const [otpAuth, setOtpAuth] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const startEnroll = async () => {
    try {
      const r = await enroll.mutateAsync();
      setOtpAuth(r.otpauth_uri);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const confirmEnroll = async () => {
    try {
      await enable.mutateAsync(code);
      notify.success('2FA включена');
      setOtpAuth(null);
      setCode('');
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const disableMfa = async () => {
    try {
      await disable.mutateAsync(pwd);
      notify.success('2FA отключена');
      setPwd('');
      setShowDisable(false);
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const enabled = !!user?.two_factor_enabled;

  return (
    <div className="space-y-3">
      {/* Header row — title left, state + action right. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">
            Двухфакторная аутентификация
          </span>
          {enabled && (
            <span
              className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
              data-testid="profile-2fa-enabled"
            >
              <CheckCircle2 className="h-3 w-3" /> включена
            </span>
          )}
        </div>

        {enabled ? (
          <button
            type="button"
            onClick={() => {
              setShowDisable(!showDisable);
              setPwd('');
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
            data-testid="profile-2fa-disable-toggle"
          >
            {showDisable ? 'Отмена' : 'Отключить'}
            {!showDisable && (
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  showDisable && 'rotate-180',
                )}
              />
            )}
          </button>
        ) : !otpAuth ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={startEnroll}
            disabled={enroll.isPending}
            data-testid="profile-2fa-enroll-start"
          >
            {enroll.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Включить
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOtpAuth(null);
              setCode('');
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Отмена
          </button>
        )}
      </div>

      {/* Enroll-confirm form */}
      {!enabled && otpAuth && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Отсканируйте QR-код в Google Authenticator / Яндекс.Ключ /
            Authy и введите 6-значный код из приложения.
          </p>
          <div
            className="rounded-md bg-muted/40 p-3 font-mono text-[11px] break-all"
            data-testid="profile-2fa-otpauth-uri"
          >
            {otpAuth}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="profile-2fa-code" className="text-xs">
                Код из приложения
              </Label>
              <Input
                id="profile-2fa-code"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="tracking-widest"
                data-testid="profile-2fa-code-input"
              />
            </div>
            <Button
              size="sm"
              onClick={confirmEnroll}
              disabled={enable.isPending || code.length < 6}
              data-testid="profile-2fa-confirm-enroll"
            >
              {enable.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Подтвердить
            </Button>
          </div>
        </div>
      )}

      {/* Disable-confirm form */}
      {enabled && showDisable && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Чтобы отключить 2FA, введите пароль учётной записи.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="profile-2fa-disable-password" className="text-xs">
                Пароль
              </Label>
              <Input
                id="profile-2fa-disable-password"
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.currentTarget.value)}
                data-testid="profile-2fa-disable-password"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={disableMfa}
              disabled={disable.isPending || !pwd}
              data-testid="profile-2fa-disable-submit"
            >
              {disable.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Отключить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TwoFactorSection;
