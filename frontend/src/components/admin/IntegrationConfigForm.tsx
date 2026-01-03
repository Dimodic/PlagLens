/**
 * Renders kind-specific configuration fields for an Integration.
 * Different kinds have different settings shapes, so the form switches per kind.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { IntegrationKind } from '@/api/endpoints/integrations';

export interface IntegrationConfigFormValues {
  display_name: string;
  course_id?: string | null;
  settings: Record<string, unknown>;
}

interface Props {
  kind: IntegrationKind;
  value: IntegrationConfigFormValues;
  onChange: (next: IntegrationConfigFormValues) => void;
  /** True when editing (course_id locked). */
  readonlyCourse?: boolean;
}

interface TagsFieldProps {
  label: string;
  placeholder?: string;
  value: string[];
  onChange: (next: string[]) => void;
}

function TagsField({ label, placeholder, value, onChange }: TagsFieldProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (value.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...value, v]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background p-2">
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="font-normal">
            {v}
            <button
              type="button"
              className="ml-1 rounded hover:bg-foreground/10"
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Удалить ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
            if (e.key === 'Backspace' && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
        />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function IntegrationConfigForm({
  kind,
  value,
  onChange,
  readonlyCourse,
}: Props) {
  const setField = (key: string, fieldValue: unknown) => {
    onChange({
      ...value,
      settings: { ...value.settings, [key]: fieldValue },
    });
  };

  const settings = value.settings ?? {};

  return (
    <div className="space-y-4" data-testid={`integration-config-${kind}-form`}>
      <div className="space-y-1.5">
        <Label htmlFor="integration-display-name">Display name</Label>
        <Input
          id="integration-display-name"
          required
          value={value.display_name}
          onChange={(e) =>
            onChange({ ...value, display_name: e.target.value })
          }
          data-testid="integration-display-name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="integration-course-id">
          course_id (опционально, для tenant-wide оставьте пустым)
        </Label>
        <Input
          id="integration-course-id"
          value={value.course_id ?? ''}
          disabled={readonlyCourse}
          onChange={(e) =>
            onChange({
              ...value,
              course_id: e.target.value || null,
            })
          }
          data-testid="integration-course-id"
        />
      </div>

      {kind === 'stepik' && (
        <>
          <div className="space-y-1.5">
            <Label>auth_method</Label>
            <Select
              value={(settings.auth_method as string) ?? 'oauth'}
              onValueChange={(v) => setField('auth_method', v ?? 'oauth')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oauth">OAuth</SelectItem>
                <SelectItem value="static_token">Static token</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TagsField
            label="stepik_course_ids"
            placeholder="56789"
            value={(settings.stepik_course_ids as string[]) ?? []}
            onChange={(v) => setField('stepik_course_ids', v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="import-only-after">import_only_after (ISO date)</Label>
            <Input
              id="import-only-after"
              placeholder="2026-02-01T00:00:00Z"
              value={(settings.import_only_after as string) ?? ''}
              onChange={(e) =>
                setField('import_only_after', e.target.value || null)
              }
            />
          </div>
        </>
      )}

      {kind === 'yandex_contest' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="oauth-token">oauth_token (или env-var name)</Label>
            <Input
              id="oauth-token"
              value={(settings.oauth_token as string) ?? ''}
              onChange={(e) => setField('oauth_token', e.target.value)}
            />
          </div>
          <TagsField
            label="contest_ids"
            placeholder="42"
            value={(settings.contest_ids as string[]) ?? []}
            onChange={(v) => setField('contest_ids', v)}
          />
        </>
      )}

      {kind === 'manual' && (
        <div className="flex items-center gap-2">
          <Switch
            id="allow-zip-upload"
            checked={Boolean(settings.allow_zip_upload ?? true)}
            onCheckedChange={(checked) => setField('allow_zip_upload', checked)}
          />
          <Label htmlFor="allow-zip-upload">Разрешить bulk-upload через ZIP</Label>
        </div>
      )}

      {kind === 'telegram' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="bot-username">bot_username</Label>
            <Input
              id="bot-username"
              value={(settings.bot_username as string) ?? ''}
              onChange={(e) => setField('bot_username', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate-limit">rate_limit_per_minute</Label>
            <Input
              id="rate-limit"
              type="number"
              min={0}
              value={String((settings.rate_limit_per_minute as number) ?? 30)}
              onChange={(e) =>
                setField('rate_limit_per_minute', Number(e.target.value) || 0)
              }
            />
          </div>
        </>
      )}

      {kind === 'google_sheets' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="service-account">service_account_email (только display)</Label>
            <Input
              id="service-account"
              value={(settings.service_account_email as string) ?? ''}
              onChange={(e) =>
                setField('service_account_email', e.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default-spreadsheet-id">default_spreadsheet_id</Label>
            <Input
              id="default-spreadsheet-id"
              value={(settings.default_spreadsheet_id as string) ?? ''}
              onChange={(e) =>
                setField('default_spreadsheet_id', e.target.value)
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

export default IntegrationConfigForm;
