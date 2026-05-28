/**
 * Service-Account-JSON modal — admin attaches a tenant-wide Google
 * Service Account for the Reporting service to use for previews and
 * grade-writes.
 *
 * Two entry paths, one form:
 *   • «Загрузить файл» reads a .json off disk via FileReader and pretty-
 *     prints it into the textarea so the admin sees exactly what's about
 *     to be sent.
 *   • Pasting raw text into the textarea is just as fine — both routes
 *     funnel into the same useGoogleSheetsSetup mutation.
 *
 * Why a dialog instead of /integrations/google-sheets/setup: the SA setup
 * is tenant-orthogonal to individual OAuth providers — surfacing it as a
 * separate page made admins navigate away from the providers list and
 * fight breadcrumbs to come back. The page lives on (it's still mounted
 * for the personal-SA mode on the teacher side) but admin uses the modal.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { CheckCircle2, Copy, Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGoogleSheetsSetup } from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoogleSheetsServiceAccountDialog({ open, onOpenChange }: Props) {
  const notify = useNotifications();
  const setup = useGoogleSheetsSetup();

  const [displayName, setDisplayName] = useState('Google Sheets');
  const [saJson, setSaJson] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState<
    | { client_email: string | null; display_name: string }
    | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset on each re-open: stale JSON or an old success banner from the
  // previous session would be confusing.
  useEffect(() => {
    if (open) {
      setDisplayName('Google Sheets');
      setSaJson('');
      setProblem(null);
      setSaved(null);
    }
  }, [open]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    setProblem(null);
    try {
      const text = await f.text();
      // Pretty-print so the admin can eyeball what's being sent. If it's
      // not valid JSON we keep the raw text — the backend will reject it
      // with a useful 400 instead of us second-guessing here.
      try {
        const parsed = JSON.parse(text);
        setSaJson(JSON.stringify(parsed, null, 2));
      } catch {
        setSaJson(text);
      }
    } catch (err) {
      setProblem({
        title: 'Не удалось прочитать файл',
        detail: String(err),
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
    } finally {
      // Reset so picking the same file twice in a row still fires onChange.
      e.currentTarget.value = '';
    }
  };

  const onSave = () => {
    const json = saJson.trim();
    if (!json) {
      setProblem({
        title: 'Вставьте JSON или загрузите файл',
        detail:
          'Без JSON сервисного аккаунта подключение сохранить не получится.',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    setProblem(null);
    setup.mutate(
      { display_name: displayName.trim() || 'Google Sheets', sa_json: json },
      {
        onSuccess: (res) => {
          setSaved({
            client_email: res.client_email,
            display_name: res.display_name,
          });
          notify.success('Google Sheets подключён');
        },
        onError: (p) => setProblem(p as unknown as Problem),
      },
    );
  };

  const copyEmail = () => {
    if (
      saved?.client_email &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    ) {
      void navigator.clipboard.writeText(saved.client_email);
      notify.info('Скопировано');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Сервисный аккаунт Google</DialogTitle>
          <DialogDescription>
            Загрузите JSON-ключ или вставьте его содержимое. Reporting-сервис
            использует его для предпросмотра таблиц и записи оценок.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-3" data-testid="sa-saved">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Подключение «{saved.display_name}» сохранено.
            </div>
            {saved.client_email && (
              <div className="space-y-1.5">
                <Label>E-mail сервисного аккаунта</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={saved.client_email}
                    className="font-mono text-xs"
                    data-testid="sa-client-email"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={copyEmail}
                    title="Скопировать"
                    aria-label="Скопировать e-mail"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Откройте таблицу → «Настройки доступа» → добавьте этот e-mail
                  как редактора.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} data-testid="sa-close">
                Готово
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {problem && (
              <Alert variant="destructive">
                <AlertTitle>{problem.title}</AlertTitle>
                {problem.detail && (
                  <AlertDescription>{problem.detail}</AlertDescription>
                )}
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="sa-name">Название подключения</Label>
              <Input
                id="sa-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
                data-testid="sa-display-name"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="sa-json">JSON сервисного аккаунта</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onPickFile}
                  className="-my-1 h-7 gap-1.5 text-xs"
                  data-testid="sa-pick-file"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Загрузить файл
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={onFile}
                  data-testid="sa-file"
                />
              </div>
              <Textarea
                id="sa-json"
                rows={10}
                value={saJson}
                onChange={(e) => setSaJson(e.currentTarget.value)}
                placeholder={
                  '{\n  "type": "service_account",\n  "client_email": "…@…iam.gserviceaccount.com",\n  …\n}'
                }
                className="font-mono text-xs"
                data-testid="sa-json"
              />
              <p className="text-xs text-muted-foreground">
                Google Cloud → IAM &amp; Admin → Service Accounts → ваш SA →
                Keys → Add Key → JSON.
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                onClick={onSave}
                disabled={!saJson.trim() || setup.isPending}
                data-testid="sa-save"
              >
                {setup.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Сохранить
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GoogleSheetsServiceAccountDialog;
