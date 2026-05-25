/**
 * Inline 2FA block for /me/profile.
 *
 * State machine:
 *   - 2FA off, no enroll started → button «Включить 2FA»
 *   - enroll started (otpauth received) → QR/URI hint + 6-digit input + Подтвердить
 *   - 2FA on → password input + Отключить
 *
 * No Card / no Alert chrome; everything sits in flat rows.
 */
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
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
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">
          Двухфакторная аутентификация
        </h3>
        {user?.two_factor_enabled && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400"
            data-testid="profile-2fa-enabled"
          >
            <CheckCircle2 className="h-3 w-3" /> включена
          </span>
        )}
      </div>

      {user?.two_factor_enabled ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Чтобы отключить 2FA, введите пароль учётной записи.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="profile-2fa-disable-password">Пароль</Label>
              <Input
                id="profile-2fa-disable-password"
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.currentTarget.value)}
                data-testid="profile-2fa-disable-password"
              />
            </div>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={disableMfa}
              disabled={disable.isPending || !pwd}
              data-testid="profile-2fa-disable-submit"
            >
              {disable.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Отключить
            </Button>
          </div>
        </div>
      ) : !otpAuth ? (
        <div>
          <Button
            variant="outline"
            onClick={startEnroll}
            disabled={enroll.isPending}
            data-testid="profile-2fa-enroll-start"
          >
            {enroll.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Включить 2FA
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
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
              <Label htmlFor="profile-2fa-code">Код из приложения</Label>
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
              onClick={confirmEnroll}
              disabled={enable.isPending || code.length < 6}
              data-testid="profile-2fa-confirm-enroll"
            >
              {enable.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Подтвердить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TwoFactorSection;
