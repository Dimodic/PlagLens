/**
 * /integrations/google-sheets/setup — tenant-level Google Sheets
 * connection (Iteration 1).
 *
 * The admin pastes a Google Service Account JSON; the backend stores it
 * as an ``IntegrationConfig`` of kind ``google_sheets``. Reporting-service
 * fetches it on demand when a teacher does the grades-to-sheet export.
 *
 * After saving we surface the SA's ``client_email`` so the admin (or the
 * teacher) can copy-paste it into the spreadsheet's «Настройки доступа».
 *
 * Iteration 2 will replace this with a real Google OAuth flow per
 * teacher; this is the fast-win predecessor.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useGoogleSheetsPersonalSetup,
  useGoogleSheetsSetup,
} from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Problem } from '@/api/types';

interface GoogleSheetsSetupPageProps {
  /** ``admin`` = tenant-wide SA (everyone exports through it).
   *  ``personal`` = teacher's own SA (only used for their exports). */
  mode?: 'admin' | 'personal';
}

export default function GoogleSheetsSetupPage({
  mode = 'admin',
}: GoogleSheetsSetupPageProps = {}) {
  useDocumentTitle(
    mode === 'personal'
      ? 'Мой Google Sheets — подключение'
      : 'Google Sheets — подключение',
  );
  const notify = useNotifications();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(
    mode === 'personal' ? 'Мой Google SA' : 'Google Sheets',
  );
  const [saJson, setSaJson] = useState('');
  const [saved, setSaved] = useState<
    | {
        id: string;
        client_email: string | null;
        display_name: string;
      }
    | null
  >(null);

  const adminSetup = useGoogleSheetsSetup();
  const personalSetup = useGoogleSheetsPersonalSetup();
  const setup = mode === 'personal' ? personalSetup : adminSetup;

  const onSave = () => {
    const json = saJson.trim();
    if (!json) {
      notify.error('Вставьте JSON сервисного аккаунта');
      return;
    }
    setup.mutate(
      { display_name: displayName.trim() || 'Google Sheets', sa_json: json },
      {
        onSuccess: (res) => {
          setSaved({
            id: res.id,
            client_email: res.client_email,
            display_name: res.display_name,
          });
          notify.success('Google Sheets подключён');
        },
        onError: (p) => {
          notify.error(
            (p as unknown as Problem).detail ||
              (p as unknown as Problem).title ||
              'Не удалось сохранить',
          );
        },
      },
    );
  };

  const copy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      notify.info('Скопировано');
    }
  };

  return (
    <Page width="regular">
      <PageHeader
        title={mode === 'personal' ? 'Мой Google Sheets' : 'Google Sheets'}
      />

      <section className="space-y-4 border-y border-border/50 py-6">
        <div className="space-y-1">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {mode === 'personal'
              ? 'Мой Service Account'
              : 'Подключение через Service Account (общее на тенант)'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === 'personal'
              ? 'Загрузите JSON-ключ ВАШЕГО сервисного аккаунта Google Cloud. Используется только вашими экспортами; общую тенантскую интеграцию не трогает.'
              : 'Загрузите JSON-ключ сервисного аккаунта Google Cloud — он станет общим для всего тенанта. Reporting-сервис будет использовать его для предпросмотра таблиц и записи оценок.'}
            {' '}Чтобы открыть конкретную таблицу — поделитесь ею с e-mail
            сервисного аккаунта (он покажется ниже после сохранения).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sa-display-name">Название подключения</Label>
          <Input
            id="sa-display-name"
            placeholder="Google Sheets"
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            data-testid="sa-display-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sa-json">JSON сервисного аккаунта</Label>
          <Textarea
            id="sa-json"
            rows={14}
            placeholder={
              '{\n  "type": "service_account",\n  "project_id": "…",\n  "private_key_id": "…",\n  "private_key": "-----BEGIN PRIVATE KEY-----…",\n  "client_email": "…@…iam.gserviceaccount.com",\n  …\n}'
            }
            value={saJson}
            onChange={(e) => setSaJson(e.currentTarget.value)}
            className="font-mono text-xs"
            data-testid="sa-json"
          />
          <p className="text-xs text-muted-foreground">
            Google Cloud → IAM &amp; Admin → Service Accounts → ваш SA → Keys →
            Add Key → Create new key → JSON. Скопируйте всё содержимое сюда.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/integrations')}
          >
            К списку интеграций
          </Button>
          <Button
            onClick={onSave}
            disabled={!saJson.trim() || setup.isPending}
            data-testid="sa-save"
          >
            {setup.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Сохранить подключение
          </Button>
        </div>
      </section>

      {saved && (
        <section
          className="space-y-3 border-b border-border/50 py-6"
          data-testid="sa-saved"
        >
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
                  onClick={() => copy(saved.client_email!)}
                  title="Скопировать"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Откройте нужную Google-таблицу → «Настройки доступа» →
                добавьте этот e-mail как редактора. После этого таблица
                станет видна в «Экспорт».
              </p>
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
