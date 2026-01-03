/**
 * /admin/integrations/new — wizard to create a new Integration config.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import {
  IntegrationConfigForm,
  type IntegrationConfigFormValues,
} from '@/components/admin/IntegrationConfigForm';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useCreateIntegration } from '@/hooks/api/useIntegrations';
import type { IntegrationKind } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

const KIND_OPTIONS: Array<{ value: IntegrationKind; label: string }> = [
  { value: 'stepik', label: 'Stepik' },
  { value: 'yandex_contest', label: 'Yandex.Contest' },
  { value: 'manual', label: 'Manual upload' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'google_sheets', label: 'Google Sheets' },
];

const STEPS = ['Тип', 'Настройки', 'Создать'];

export function IntegrationCreatePage() {
  useDocumentTitle('Новая интеграция');
  const notify = useNotifications();
  const navigate = useNavigate();
  const create = useCreateIntegration();

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<IntegrationKind>('stepik');
  const [values, setValues] = useState<IntegrationConfigFormValues>({
    display_name: '',
    course_id: null,
    settings: {},
  });
  const [problem, setProblem] = useState<Problem | null>(null);

  const handleCreate = async () => {
    setProblem(null);
    try {
      const result = await create.mutateAsync({
        kind,
        course_id: values.course_id ?? null,
        display_name: values.display_name,
        settings: values.settings,
      });
      notify.success('Интеграция создана');
      if (result.oauth_authorize_url) {
        notify.info('Нужна OAuth-авторизация');
      }
      navigate('/integrations');
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <Page width="narrow">
      <Link
        to="/integrations"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Интеграции
      </Link>
      <PageHeader title="Новая интеграция" />

      <div className="text-xs text-muted-foreground">
        Шаг {step + 1} из {STEPS.length}
      </div>

      {/* Stepper header (minimalist) */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const isActive = i === step;
          const isDone = i < step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-2 ${
                i > step ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                  isDone || isActive
                    ? 'bg-foreground text-background'
                    : 'border border-border text-muted-foreground'
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={`text-sm ${
                  isActive ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="h-px w-6 bg-border" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="integration-kind">Тип</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind((v as IntegrationKind) ?? 'stepik')}
            >
              <SelectTrigger id="integration-kind" data-testid="integration-wizard-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-2">
            <Button onClick={() => setStep(1)} data-testid="integration-wizard-next-step1">
              Далее
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <IntegrationConfigForm kind={kind} value={values} onChange={setValues} />
          <div className="pt-2">
            <Button
              onClick={() => setStep(2)}
              disabled={!values.display_name}
              data-testid="integration-wizard-next-step2"
            >
              Далее
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm">
            <b>{kind}</b> · <b>{values.display_name}</b>
          </p>
          {problem && <ProblemAlert problem={problem} />}
          <div className="pt-2">
            <Button
              onClick={handleCreate}
              disabled={create.isPending}
              data-testid="integration-wizard-create"
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}

export default IntegrationCreatePage;
