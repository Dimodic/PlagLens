/**
 * Token-based integration dialog (eJudge / Manual ZIP).
 *
 * For providers that don't speak OAuth we collect the bare minimum on
 * the spot — name + (optional URL/token) — and create the integration
 * in one POST. After success the user is bounced to the detail page
 * where any provider-specific knobs (cron schedules, target courses,
 * webhook URLs, etc.) can be tuned without crowding this modal.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import type { IntegrationKind } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

interface Props {
  open: boolean;
  kind: IntegrationKind | null;
  onOpenChange: (open: boolean) => void;
}

const TITLES: Partial<Record<IntegrationKind, string>> = {
  ejudge: 'Подключить eJudge',
  manual: 'Ручная загрузка (ZIP)',
};

const DESCRIPTIONS: Partial<Record<IntegrationKind, string>> = {
  ejudge:
    'Введите адрес eJudge-сервера и токен, выданный администратором контеста.',
  manual:
    'Создаст «папку» для ручных загрузок ZIP-архивов. Файлы вы будете заливать на странице интеграции.',
};

const DEFAULT_NAMES: Partial<Record<IntegrationKind, string>> = {
  ejudge: 'eJudge',
  manual: 'Ручная загрузка',
};

export function TokenIntegrationDialog({ open, kind, onOpenChange }: Props) {
  const notify = useNotifications();
  const navigate = useNavigate();
  const create = useCreateIntegration();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  // Reset every time we re-open with a new kind so leftover input from a
  // previous attempt doesn't carry over to, say, eJudge → Manual ZIP.
  useEffect(() => {
    if (!open) return;
    setName(kind ? (DEFAULT_NAMES[kind] ?? '') : '');
    setUrl('');
    setToken('');
  }, [open, kind]);

  if (!kind) return null;

  const isManual = kind === 'manual';
  const requiresUrl = !isManual;
  const requiresToken = !isManual;

  const canSubmit =
    !!name.trim() &&
    (!requiresUrl || !!url.trim()) &&
    (!requiresToken || !!token.trim());

  const onSubmit = async () => {
    if (!canSubmit) return;
    const settings: Record<string, unknown> = {};
    if (requiresUrl) settings.base_url = url.trim();
    if (requiresToken) settings.api_token = token.trim();

    try {
      const res = await create.mutateAsync({
        kind,
        display_name: name.trim(),
        settings,
      });
      notify.success(`${TITLES[kind] ?? 'Интеграция'} — создана`);
      onOpenChange(false);
      navigate(`/integrations/${res.config.id}`);
    } catch (err) {
      const p = err as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось создать');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`token-integration-dialog-${kind}`}>
        <DialogHeader>
          <DialogTitle>{TITLES[kind] ?? 'Подключение'}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[kind] ?? ''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ti-name">Название</Label>
            <Input
              id="ti-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder={DEFAULT_NAMES[kind] ?? ''}
              autoFocus
              data-testid="token-integration-name"
            />
          </div>

          {requiresUrl && (
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
          )}

          {requiresToken && (
            <div className="space-y-1.5">
              <Label htmlFor="ti-token">API-токен</Label>
              <Input
                id="ti-token"
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
                type="password"
                placeholder="токен из админки провайдера"
                autoComplete="off"
                data-testid="token-integration-token"
              />
              <p className="text-xs text-muted-foreground">
                Токен хранится зашифрованным и используется только для
                запросов к провайдеру.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Отмена
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!canSubmit || create.isPending}
            data-testid="token-integration-submit"
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Подключить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TokenIntegrationDialog;
