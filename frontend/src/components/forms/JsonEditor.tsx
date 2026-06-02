/**
 * Lightweight JSON editor — Textarea with monospace font and live
 * validation via JSON.parse on blur.
 */
import { useEffect, useId, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

interface Props {
  label?: string;
  value: unknown;
  onChange: (next: unknown, raw: string) => void;
  /** Min rows, default 6. */
  minRows?: number;
  /** When parse fails on blur, this prevents emitting invalid value. */
  required?: boolean;
}

function format(v: unknown): string {
  if (v === undefined || v === null) return '';
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function JsonEditor({
  label,
  value,
  onChange,
  minRows = 6,
  required,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState<string>(format(value));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(format(value));
  }, [value]);

  const validate = (raw: string) => {
    if (!raw.trim()) {
      if (required) {
        setErr(t('json_editor.empty_error'));
        return;
      }
      setErr(null);
      onChange(null, raw);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setErr(null);
      onChange(parsed, raw);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={() => validate(text)}
        rows={minRows}
        className={cn(
          'font-mono text-[13px]',
          err && 'border-destructive focus-visible:ring-destructive/20',
        )}
        aria-invalid={!!err}
        data-testid="json-editor"
      />
      {err ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" /> {err}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3 w-3" /> {t('json_editor.valid')}
        </p>
      )}
    </div>
  );
}

export default JsonEditor;
