/**
 * ExportCreateModal — create new export. Pick kind, format, scope.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n';
import type {
  CreateExportInput,
  ExportFormat,
  ExportKind,
} from '@/api/endpoints/reporting';

export interface ExportCreateModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (input: CreateExportInput) => void;
  defaultKind?: ExportKind;
  defaultScope?: Record<string, unknown>;
  busy?: boolean;
}

const KINDS: { value: ExportKind; labelKey: string }[] = [
  { value: 'assignment_grades', labelKey: 'export_create.kind_assignment_grades' },
  { value: 'course_summary', labelKey: 'export_create.kind_course_summary' },
  { value: 'plagiarism_report', labelKey: 'export_create.kind_plagiarism_report' },
  { value: 'ai_analysis_summary', labelKey: 'export_create.kind_ai_analysis_summary' },
  { value: 'audit_log', labelKey: 'export_create.kind_audit_log' },
];

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
  { value: 'json', label: 'JSON' },
  { value: 'pdf', label: 'PDF' },
  { value: 'google_sheets', label: 'Google Sheets' },
];

export function ExportCreateModal({
  opened,
  onClose,
  onSubmit,
  defaultKind = 'course_summary',
  defaultScope,
  busy,
}: ExportCreateModalProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ExportKind>(defaultKind);
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [anonymize, setAnonymize] = useState(false);
  const [scopeJson, setScopeJson] = useState(
    defaultScope ? JSON.stringify(defaultScope, null, 2) : '',
  );

  const handle = () => {
    let scope: Record<string, unknown> | undefined = undefined;
    if (scopeJson.trim()) {
      try {
        scope = JSON.parse(scopeJson);
      } catch {
        scope = undefined;
      }
    } else if (defaultScope) {
      scope = defaultScope;
    }
    onSubmit({
      kind,
      format,
      scope,
      options: { anonymize },
    });
  };

  return (
    <Dialog
      open={opened}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent data-testid="export-create-modal">
        <DialogHeader>
          <DialogTitle>{t('export_create.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4" data-testid="export-create-form">
          <div className="space-y-1.5">
            <Label htmlFor="export-kind">{t('export_create.kind_label')}</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as ExportKind)}
            >
              <SelectTrigger id="export-kind" data-testid="export-kind-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {t(k.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-format">{t('export_create.format_label')}</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
            >
              <SelectTrigger
                id="export-format"
                data-testid="export-format-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="export-anonymize"
              checked={anonymize}
              onCheckedChange={setAnonymize}
              data-testid="export-anonymize-toggle"
            />
            <Label htmlFor="export-anonymize">{t('export_create.anonymize')}</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-scope">{t('export_create.scope_label')}</Label>
            <Textarea
              id="export-scope"
              placeholder='{"course_id":"...","assignment_id":"..."}'
              rows={3}
              value={scopeJson}
              onChange={(e) => setScopeJson(e.currentTarget.value)}
              className="font-mono text-[13px]"
              data-testid="export-scope-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            data-testid="export-cancel-btn"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handle}
            disabled={busy}
            data-testid="export-submit-btn"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
