/**
 * ScheduleCronInput — cron text input with helper presets.
 */
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ScheduleCronInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

const PRESETS = [
  { label: 'Каждый день 09:00', cron: '0 9 * * *' },
  { label: 'Каждую неделю (пн 09:00)', cron: '0 9 * * 1' },
  { label: 'Каждый месяц (1-е, 09:00)', cron: '0 9 1 * *' },
  { label: 'Каждый час', cron: '0 * * * *' },
];

const CRON_RE = /^[\d*/,\-\s]+$/;

export function ScheduleCronInput({
  value,
  onChange,
  error,
}: ScheduleCronInputProps) {
  const id = useId();
  const isValid =
    !value || (CRON_RE.test(value) && value.split(/\s+/).length === 5);
  const errorMsg = error ?? (!isValid && value ? 'Неверный формат cron' : null);

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Cron-выражение</Label>
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
            Минута Час День Месяц День_недели
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Пресеты:</span>
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
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
