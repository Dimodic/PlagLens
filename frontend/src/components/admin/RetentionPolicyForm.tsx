/**
 * Form to edit audit retention policy values.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/i18n';
import type { RetentionPolicy } from '@/api/endpoints/audit';

interface Props {
  initial: RetentionPolicy | undefined;
  onSubmit: (
    body: Partial<
      Omit<RetentionPolicy, 'scope' | 'scope_id' | 'updated_at' | 'updated_by'>
    >,
  ) => Promise<unknown> | void;
  loading?: boolean;
}

export function RetentionPolicyForm({ initial, onSubmit, loading }: Props) {
  const { t } = useTranslation();
  const [defDays, setDefDays] = useState<number>(initial?.default_retention_days ?? 365);
  const [longDays, setLongDays] = useState<number>(initial?.long_retention_days ?? 2555);
  const [legalHold, setLegalHold] = useState<boolean>(initial?.legal_hold_active ?? false);

  useEffect(() => {
    if (initial) {
      setDefDays(initial.default_retention_days);
      setLongDays(initial.long_retention_days);
      setLegalHold(initial.legal_hold_active);
    }
  }, [initial]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="retention-default-days">default_retention_days</Label>
        <Input
          id="retention-default-days"
          type="number"
          min={1}
          value={String(defDays)}
          onChange={(e) => setDefDays(Number(e.target.value) || 0)}
          data-testid="retention-default-days"
        />
        <p className="text-xs text-muted-foreground">{t('retention_policy.default_days_hint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="retention-long-days">long_retention_days</Label>
        <Input
          id="retention-long-days"
          type="number"
          min={1}
          value={String(longDays)}
          onChange={(e) => setLongDays(Number(e.target.value) || 0)}
          data-testid="retention-long-days"
        />
        <p className="text-xs text-muted-foreground">
          {t('retention_policy.long_days_hint')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="retention-legal-hold-toggle"
          checked={legalHold}
          onCheckedChange={setLegalHold}
          data-testid="retention-legal-hold-toggle"
        />
        <Label htmlFor="retention-legal-hold-toggle">
          {t('retention_policy.legal_hold_label')}
        </Label>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={loading}
          onClick={() =>
            onSubmit({
              default_retention_days: defDays,
              long_retention_days: longDays,
              legal_hold_active: legalHold,
            })
          }
          data-testid="retention-save-button"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('retention_policy.save')}
        </Button>
      </div>
    </div>
  );
}

export default RetentionPolicyForm;
