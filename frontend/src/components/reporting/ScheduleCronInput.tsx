/**
 * ScheduleCronInput — cron text input with helper presets.
 */
import { useId } from 'react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ScheduleCronInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

const PRESETS = [
  { labelKey: 'schedule_cron.preset_daily', cron: '0 9 * * *' },
  { labelKey: 'schedule_cron.preset_weekly', cron: '0 9 * * 1' },
  { labelKey: 'schedule_cron.preset_monthly', cron: '0 9 1 * *' },
  { labelKey: 'schedule_cron.preset_hourly', cron: '0 * * * *' },
] as const;

const CRON_RE = /^[\d*/,\-\s]+$/;

export function ScheduleCronInput({
  value,
  onChange,
  error,
}: ScheduleCronInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const isValid =
    !value || (CRON_RE.test(value) && value.split(/\s+/).length === 5);
  const errorMsg =
    error ?? (!isValid && value ? t('schedule_cron.invalid') : null);

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t('schedule_cron.label')}</Label>
        <Input
          id={id}
          placeholder="0 9 * * *"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          aria-invalid={!!errorMsg}
          data-testid="cron-input"
        />
        {errorMsg ? (
          <p className="text-sm text-destructive">{errorMsg}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('schedule_cron.fields_hint')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t('schedule_cron.presets')}
        </span>
        {PRESETS.map((p) => (
          <Button
            key={p.cron}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange(p.cron)}
            data-testid={`cron-preset-${p.cron.replace(/\s/g, '_')}`}
          >
            {t(p.labelKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}
