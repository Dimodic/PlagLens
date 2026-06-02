/**
 * Modal for creating an API key. Once created, the full key is shown ONCE
 * with a copy button and an explicit warning.
 */
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n';
import type { ApiKeyCreated } from '@/api/endpoints/users';

const SCOPES = [
  'submissions:read',
  'submissions:write',
  'plagiarism:read',
  'ai:read',
  'reports:read',
  'admin:read',
];

interface Props {
  opened: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; scopes: string[] }) => Promise<ApiKeyCreated>;
}

export function ApiKeyCreateModal({ opened, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName('');
    setScopes([]);
    setCreated(null);
    setErr(null);
    setCopied(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr(t('api_key_create.name_required'));
      return;
    }
    setLoading(true);
    try {
      const result = await onCreate({ name: name.trim(), scopes });
      setCreated(result);
    } catch (e) {
      const p = e as { detail?: string; title?: string };
      setErr(p?.detail ?? p?.title ?? t('api_key_create.create_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('api_key_create.title')}</DialogTitle>
        </DialogHeader>
        {!created ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-name">
                {t('api_key_create.name_label')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="api-key-name"
                placeholder="ci-pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="api-key-name-input"
              />
            </div>
            <div className="space-y-2" data-testid="api-key-scopes-select">
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {SCOPES.map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={scopes.includes(s)}
                      onCheckedChange={() => toggleScope(s)}
                    />
                    <span className="font-mono text-xs">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            {err && (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                data-testid="api-key-create-submit"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert data-testid="api-key-once-warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('api_key_create.once_title')}</AlertTitle>
              <AlertDescription>
                {t('api_key_create.once_body')}
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">API key</p>
              <div className="flex items-stretch gap-2">
                <code
                  className="flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs"
                  data-testid="api-key-modal-key"
                >
                  {created.key}
                </code>
                <Button
                  variant="secondary"
                  onClick={handleCopy}
                  data-testid="api-key-copy-button"
                >
                  {copied ? (
                    <Check className="mr-2 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-2 h-3.5 w-3.5" />
                  )}
                  {copied ? t('api_key_create.copied') : t('api_key_create.copy')}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} data-testid="api-key-modal-done">
                {t('api_key_create.done')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ApiKeyCreateModal;
