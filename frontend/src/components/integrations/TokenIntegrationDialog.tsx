/**
 * Token-based integration dialog (eJudge).
 *
 * eJudge is the one source a teacher connects with a server URL + token
 * rather than OAuth, so we collect those on the spot and create the
 * integration in one POST. On success the dialog just closes — the
 * integrations list refetches and the master-detail pane flips to the
 * new source's settings. No bounce to a separate page.
 *
 * (Manual / ZIP uploads no longer go through here — that source is
 * created inline from its connect prompt and uploads happen in its
 * detail pane.)
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateIntegration } from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import type { IntegrationKind } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

interface Props {
  open: boolean;
  kind: IntegrationKind | null;
  onOpenChange: (open: boolean) => void;
}

const TITLE_KEYS: Partial<Record<IntegrationKind, string>> = {
  ejudge: 'token_integration.title_ejudge',
};

const DESCRIPTION_KEYS: Partial<Record<IntegrationKind, string>> = {
  ejudge: 'token_integration.description_ejudge',
};

const DEFAULT_NAMES: Partial<Record<IntegrationKind, string>> = {
  ejudge: 'eJudge',
};

export function TokenIntegrationDialog({ open, kind, onOpenChange }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const create = useCreateIntegration();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  // Reset every time we re-open so leftover input from a previous attempt
  // doesn't carry over.
  useEffect(() => {
    if (!open) return;
    setName(kind ? (DEFAULT_NAMES[kind] ?? '') : '');
    setUrl('');
    setToken('');
  }, [open, kind]);

  if (!kind) return null;

  const canSubmit = !!name.trim() && !!url.trim() && !!token.trim();

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        kind,
        display_name: name.trim(),
        settings: { base_url: url.trim(), api_token: token.trim() },
      });
      const titleKey = TITLE_KEYS[kind];
      const label = titleKey ? t(titleKey) : t('token_integration.fallback_name');
      notify.success(t('token_integration.created', { name: label }));
      onOpenChange(false);
    } catch (err) {
      const p = err as Problem;
      notify.error(p?.detail ?? p?.title ?? t('token_integration.create_failed'));
    }
  };

  const titleKey = TITLE_KEYS[kind];
  const descriptionKey = DESCRIPTION_KEYS[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`token-integration-dialog-${kind}`}>
        <DialogHeader>
          <DialogTitle>
            {titleKey ? t(titleKey) : t('token_integration.fallback_title')}
          </DialogTitle>
          <DialogDescription>
            {descriptionKey ? t(descriptionKey) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ti-name">{t('token_integration.name_label')}</Label>
            <Input
              id="ti-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder={DEFAULT_NAMES[kind] ?? ''}
              autoFocus
              data-testid="token-integration-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ti-url">URL</Label>
            <Input
              id="ti-url"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
              placeholder="https://ejudge.example.org"
              inputMode="url"
              autoComplete="off"
              data-testid="token-integration-url"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ti-token">{t('token_integration.token_label')}</Label>
            <Input
              id="ti-token"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              type="password"
              placeholder={t('token_integration.token_placeholder')}
              autoComplete="off"
              data-testid="token-integration-token"
            />
            <p className="text-xs text-muted-foreground">
              {t('token_integration.token_hint')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!canSubmit || create.isPending}
            data-testid="token-integration-submit"
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('token_integration.connect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TokenIntegrationDialog;
