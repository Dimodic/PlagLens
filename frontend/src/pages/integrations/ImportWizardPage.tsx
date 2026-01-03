/**
 * /imports — multi-step import wizard.
 *
 * Steps:
 *   1. Source (LMS / Git / Manual ZIP — backed by `useIntegrations`)
 *   2. Auth / display name
 *   3. Course mapping
 *   4. Review & run (creates an Integration via `useCreateIntegration`)
 *
 * The page lives at `/imports` and is wired into the AppShell-protected
 * route tree by `routes/index.tsx`.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import {
  useCreateIntegration,
  useIntegrations,
} from '@/hooks/api/useIntegrations';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import type { IntegrationKind } from '@/api/endpoints/integrations';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';

interface SourceOption {
  id: IntegrationKind;
  name: string;
  category: 'lms' | 'git' | 'manual';
}

const SOURCES: SourceOption[] = [
  { id: 'stepik', name: 'Stepik', category: 'lms' },
  { id: 'yandex_contest', name: 'Yandex.Contest', category: 'lms' },
  { id: 'manual', name: 'Manual / ZIP', category: 'manual' },
];

interface StepDef {
  id: string;
  label: string;
}

const STEPS: StepDef[] = [
  { id: 'source', label: 'Источник' },
  { id: 'auth', label: 'Авторизация' },
  { id: 'map', label: 'Курс' },
  { id: 'run', label: 'Запуск' },
];

function statusBadge(
  status: 'active' | 'pending_auth' | 'error' | 'disabled' | string,
) {
  const tone: StatusTone =
    status === 'active'
      ? 'success'
      : status === 'pending_auth'
        ? 'warning'
        : status === 'error'
          ? 'destructive'
          : 'neutral';
  return <StatusPill tone={tone}>{status}</StatusPill>;
}

export default function ImportWizardPage() {
  useDocumentTitle('Импорт');
  const navigate = useNavigate();
  const notify = useNotifications();
  const create = useCreateIntegration();
  const integrations = useIntegrations({ limit: 50 });
  const myCourses = useMyCourses();

  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState<IntegrationKind>('stepik');
  const [displayName, setDisplayName] = useState('');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const source = useMemo(
    () => SOURCES.find((s) => s.id === sourceId) ?? SOURCES[0],
    [sourceId],
  );

  const existing = integrations.data?.data ?? [];

  const next = () => {
    setProblem(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const handleRun = async () => {
    setProblem(null);
    try {
      const result = await create.mutateAsync({
        kind: sourceId,
        course_id: courseId ?? null,
        display_name:
          displayName ||
          `${source.name} — ${new Date().toISOString().slice(0, 10)}`,
        settings: {},
      });
      notify.success('Интеграция создана, импорт запущен');
      if (result.oauth_authorize_url) {
        notify.info('Требуется OAuth-авторизация — откройте детали интеграции');
      }
      // Teacher-friendly mirror — same page, works for teacher+admin.
      navigate(`/integrations/${result.config.id}`);
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  return (
    <Page width="narrow" data-testid="import-wizard-page">
      {/* Single exit — minimal text, always visible at the top. */}
      <button
        type="button"
        onClick={() => navigate('/integrations')}
        data-testid="import-wizard-back"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Интеграции
      </button>

      <PageHeader title="Импорт" />

      {/* Stepper */}
      <div className="flex gap-0 border-b">
        {STEPS.map((s, i) => {
          const on = i === step;
          const done = i < step;
          return (
            <div
              key={s.id}
              onClick={() => i <= step && setStep(i)}
              data-testid={`import-step-${s.id}`}
              className={`flex-1 pr-4 pb-3 ${
                i <= step ? 'cursor-pointer' : 'opacity-55'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-xs tabular-nums ${
                    on
                      ? 'text-foreground font-medium'
                      : done
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/60'
                  }`}
                >
                  0{i + 1}
                </span>
                {done && <Check className="h-3 w-3 text-emerald-500" />}
                <span
                  className={`text-sm ${
                    on
                      ? 'text-foreground font-medium'
                      : done
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              <div
                className={`mt-3 h-0.5 ${
                  on
                    ? 'bg-foreground'
                    : done
                      ? 'bg-muted-foreground'
                      : 'bg-border'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="min-h-[360px]">
        {step === 0 && (
          <section className="space-y-4">
            <SectionHeader title="Источник" />
            <Card className="border-border/70">
              <CardContent className="p-0">
                {SOURCES.map((s, idx) => {
                  const on = sourceId === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSourceId(s.id)}
                      data-testid={`import-source-${s.id}`}
                      className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/30 ${
                        idx > 0 ? 'border-t border-border/70' : ''
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border ${
                          on
                            ? 'border-foreground'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {on && (
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                        )}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {s.name}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <SectionHeader title="Авторизация" />
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="import-display-name">Название интеграции</Label>
                <Input
                  id="import-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                  placeholder={`${source.name} · ${new Date().getFullYear()}`}
                  data-testid="import-display-name"
                />
              </div>
              {existing.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Существующие интеграции
                  </div>
                  <Card className="border-border/70">
                    <CardContent className="p-0">
                      {existing.slice(0, 3).map((it, idx) => (
                        <div
                          key={it.id}
                          className={`flex items-center gap-3 px-5 py-3 ${
                            idx > 0 ? 'border-t border-border/70' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">
                              {it.display_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {it.kind}
                            </div>
                          </div>
                          {statusBadge(it.status)}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <SectionHeader title="Курс" />
            <Card className="border-border/70">
              <CardContent className="p-0">
                <div
                  onClick={() => setCourseId(null)}
                  className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
                >
                  <span
                    className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border ${
                      courseId === null
                        ? 'border-foreground'
                        : 'border-muted-foreground/40'
                    }`}
                  >
                    {courseId === null && (
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    Без привязки к курсу
                  </span>
                </div>
                {(myCourses.data?.data ?? []).map((c) => {
                  const on = courseId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setCourseId(c.id)}
                      data-testid={`import-course-${c.id}`}
                      className="flex cursor-pointer items-center gap-3 border-t border-border/70 px-5 py-3.5 transition-colors hover:bg-muted/30"
                    >
                      <span
                        className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border ${
                          on
                            ? 'border-foreground'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {on && (
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {c.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <SectionHeader title="Готово к запуску" />
            <Card className="border-border/70">
              <CardContent className="p-0">
                <SummaryRow label="Источник" value={source.name} first />
                <SummaryRow
                  label="Название"
                  value={
                    displayName ||
                    `${source.name} · ${new Date().toISOString().slice(0, 10)}`
                  }
                />
                <SummaryRow
                  label="Курс"
                  value={
                    courseId
                      ? (myCourses.data?.data ?? []).find(
                          (c) => c.id === courseId,
                        )?.name ?? courseId
                      : 'Без привязки'
                  }
                />
              </CardContent>
            </Card>
            {problem && <ProblemAlert problem={problem} />}
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t pt-5">
        <span className="text-xs text-muted-foreground">
          Шаг {step + 1} из {STEPS.length}
        </span>
        <div className="flex-1" />
        {step > 0 && (
          <Button variant="outline" onClick={back}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next} data-testid="import-wizard-next">
            Далее
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleRun}
            disabled={create.isPending}
            data-testid="import-wizard-run"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Запустить импорт
          </Button>
        )}
      </div>
    </Page>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b pb-3">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  first,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[200px_1fr] items-baseline gap-6 px-5 py-4 ${
        first ? '' : 'border-t border-border/70'
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
