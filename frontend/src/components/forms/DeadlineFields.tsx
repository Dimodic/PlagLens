/**
 * Soft + hard deadline date+time pickers.
 *
 * Uses native <input type="datetime-local"> wrapped in shadcn Input. Stores
 * values as ISO strings on the wire; converts to/from local datetime-local
 * format internally.
 */
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n';

interface DeadlineFieldsProps {
  softAt: string | null;
  hardAt: string | null;
  onChange: (next: { softAt: string | null; hardAt: string | null }) => void;
  error?: string;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // `datetime-local` expects YYYY-MM-DDTHH:mm in *local* time.
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function DeadlineFields({
  softAt,
  hardAt,
  onChange,
  error,
}: DeadlineFieldsProps) {
  const { t } = useTranslation();
  const softId = useId();
  const hardId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={softId}>{t('deadline_fields.soft_label')}</Label>
        <Input
          id={softId}
          type="datetime-local"
          value={toLocalInput(softAt)}
          onChange={(e) =>
            onChange({ softAt: fromLocalInput(e.currentTarget.value), hardAt })
          }
        />
        <p className="text-xs text-muted-foreground">
          {t('deadline_fields.soft_hint')}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={hardId}>{t('deadline_fields.hard_label')}</Label>
        <Input
          id={hardId}
          type="datetime-local"
          value={toLocalInput(hardAt)}
          onChange={(e) =>
            onChange({ softAt, hardAt: fromLocalInput(e.currentTarget.value) })
          }
          aria-invalid={!!error}
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('deadline_fields.hard_hint')}
          </p>
        )}
      </div>
    </div>
  );
}
