/**
 * Inline 2FA block for /me/profile.
 *
 * Compact row by default: title + state + single action button on the
 * right. Clicking «Включить 2FA» starts the enroll flow inline; the
 * form (otpauth URI + 6-digit code input) drops below the row. Disabling
 * 2FA exposes a single password field + button — same row pattern.
 */
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export function TwoFactorSection() {
  const { t } = useTranslation();
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
      notify.error((e as Problem)?.detail ?? t('two_factor.error_generic'));
    }
  };

  const confirmEnroll = async () => {
    try {
      await enable.mutateAsync(code);
      notify.success(t('two_factor.enabled_toast'));
      setOtpAuth(null);
      setCode('');
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('two_factor.error_generic'));
    }
  };

  const disableMfa = async () => {
    try {
      await disable.mutateAsync(pwd);
      notify.success(t('two_factor.disabled_toast'));
      setPwd('');
      setShowDisable(false);
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('two_factor.error_generic'));
    }
  };

  const enabled = !!user?.two_factor_enabled;

  return (
    <div className="space-y-3">
      {/* Header row — title left, state + action right. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">
            {t('two_factor.title')}
          </span>
          {enabled && (
            <span
              className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
              data-testid="profile-2fa-enabled"
            >
              <CheckCircle2 className="h-3 w-3" /> {t('two_factor.status_enabled')}
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
            {showDisable ? t('two_factor.cancel') : t('two_factor.disable')}
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
            {t('two_factor.enable')}
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
            {t('two_factor.cancel')}
          </button>
        )}
      </div>

      {/* Enroll-confirm form */}
      {!enabled && otpAuth && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {t('two_factor.enroll_instruction')}
          </p>
          {/* QR generated in-browser from the otpauth URI (backend returns
              qr_svg=null — never implemented). White box so it scans on the
              dark theme. */}
          <div className="flex justify-center">
            <div
              className="rounded-md bg-white p-3"
              data-testid="profile-2fa-qr"
            >
              <QRCodeSVG value={otpAuth} size={176} level="M" />
            </div>
          </div>
          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
              {t('two_factor.manual_key_summary')}
            </summary>
            <div
              className="mt-2 rounded-md bg-muted/40 p-3 font-mono text-[11px] break-all"
              data-testid="profile-2fa-otpauth-uri"
            >
              {otpAuth}
            </div>
          </details>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="profile-2fa-code" className="text-xs">
                {t('two_factor.code_label')}
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
              {t('two_factor.confirm')}
            </Button>
          </div>
        </div>
      )}

      {/* Disable-confirm form */}
      {enabled && showDisable && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {t('two_factor.disable_instruction')}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="profile-2fa-disable-password" className="text-xs">
                {t('two_factor.password_label')}
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
              {t('two_factor.disable')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TwoFactorSection;
