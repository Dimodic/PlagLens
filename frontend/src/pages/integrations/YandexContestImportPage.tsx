/**
 * /integrations/yandex-contest/:configId/contests — import participants from
 * a Yandex.Contest contest into the bound PlagLens course.
 *
 * Yandex.Contest API does NOT expose "list all contests" — you must know the
 * contest_id ahead of time. PlagLens stores those IDs on each homework
 * (description field "Yandex.Contest contest_id=NNNNN" by convention), so we:
 *   1) Load the bound config to find its course_id.
 *   2) Load that course's homeworks and parse contest_id from descriptions.
 *   3) Render each homework as a one-click "Импортировать" row.
 *   4) Also offer a manual contest_id input as a fallback.
 *
 * Each click calls our backend `import-participants`, which in turn pulls
 * Yandex.Contest API → identity bulk-import → course batchCreate.
 */
import { FormEvent, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  Users,
  FileText,
  Trash2,
  CalendarDays,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { integrationsApi } from '@/api/endpoints/integrations';
import { useIntegration } from '@/hooks/api/useIntegrations';
import { homeworksApi } from '@/api/endpoints/homeworks';
import { useSyncNow } from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import { Badge } from '@/components/ui/badge';
import type { Problem } from '@/api/types';

interface ImportSummary {
  imported: number;
  failed: number;
  errors: string[];
  identity?: { created: number; existing: number };
  course?: { added: number; existing: number; failed: number; error?: string };
}

interface SubmissionsSummary {
  fetched: number;
  failed: number;
  errors: string[];
  cursor: Record<string, unknown>;
  note?: string;
}

const CONTEST_ID_RE = /contest_id\s*=\s*(\d+)/i;

function extractContestId(description?: string | null): number | null {
  if (!description) return null;
  const m = description.match(CONTEST_ID_RE);
  return m ? Number(m[1]) : null;
}

export default function YandexContestImportPage() {
  useDocumentTitle('Импорт из Yandex.Contest');
  const { configId } = useParams<{ configId: string }>();

  const cfgQ = useIntegration(configId);
  const courseId = cfgQ.data?.course_id;

  const hwQ = useQuery({
    queryKey: ['course-homeworks', courseId],
    queryFn: () => homeworksApi.listForCourse(String(courseId), { limit: 200 }),
    enabled: !!courseId,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeworks: any[] = hwQ.data?.data ?? [];

  const candidates = useMemo(
    () =>
      homeworks
        .map((hw) => ({
          hw,
          contestId: extractContestId(hw.description),
        }))
        .filter((x) => x.contestId !== null) as Array<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hw: any;
        contestId: number;
      }>,
    [homeworks],
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportSummary>>({});
  const [subResults, setSubResults] = useState<Record<string, SubmissionsSummary>>({});
  const [manualId, setManualId] = useState('');

  const onImportSubmissions = async (contestId: number, key: string) => {
    if (!configId) return;
    setBusyId(`sub-${key}`);
    try {
      const res = await integrationsApi.ycImportSubmissions(configId, contestId);
      setSubResults((prev) => ({ ...prev, [key]: res }));
    } catch (raw) {
      const p = raw as Problem;
      setSubResults((prev) => ({
        ...prev,
        [key]: {
          fetched: 0,
          failed: 1,
          errors: [p.detail ?? p.title ?? 'Ошибка импорта'],
          cursor: {},
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  const onImport = async (contestId: number, key: string) => {
    if (!configId) return;
    setBusyId(key);
    try {
      const res = await integrationsApi.ycImportParticipants(configId, contestId);
      setResults((prev) => ({
        ...prev,
        [key]: {
          imported: res.imported,
          failed: res.failed,
          errors: res.errors,
          identity: res.identity,
          course: res.course,
        },
      }));
    } catch (raw) {
      const p = raw as Problem;
      setResults((prev) => ({
        ...prev,
        [key]: {
          imported: 0,
          failed: 1,
          errors: [p.detail ?? p.title ?? 'Ошибка импорта'],
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = Number(manualId.trim());
    if (!id) return;
    void onImport(id, `manual-${id}`);
  };

  const queryClient = useQueryClient();
  const notifyTop = useNotifications();
  const deleteHwM = useMutation({
    mutationFn: (hwId: string) => homeworksApi.delete(hwId),
    onSuccess: () => {
      notifyTop.success('ДЗ удалено из курса');
      queryClient.invalidateQueries({ queryKey: ['course-homeworks', courseId] });
    },
    onError: (e) => notifyTop.error((e as unknown as Problem)?.detail ?? 'Не удалось удалить'),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDeleteHw = (hw: any) => {
    if (!confirm(`Удалить «${hw.title}» из курса? Связь с Yandex.Contest пропадёт.`))
      return;
    deleteHwM.mutate(String(hw.id));
  };

  return (
    <Page width="regular">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Импорт из Yandex.Contest
        </h1>
        <p className="text-sm text-muted-foreground">
          Привязанные к курсу контесты. Импорт студентов и посылок работает
          автоматически каждые 5 минут — кнопки ниже запускают конкретный
          контест вручную.
        </p>
      </div>

      {configId && <SyncHistorySection configId={configId} />}

      {cfgQ.isPending || hwQ.isPending ? (
        <Card className="border-border/70">
          <CardContent className="p-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
          </CardContent>
        </Card>
      ) : candidates.length === 0 ? (
        <Card className="border-dashed border-border/70">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <p>В курсе нет ДЗ с привязанным contest_id.</p>
            <p className="mt-2">
              Используйте форму ниже, чтобы импортировать участников по ID
              вручную.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70">
          <CardContent className="p-0">
            {candidates.map(({ hw, contestId }, idx) => {
              const key = `hw-${hw.id}`;
              const r = results[key];
              const sub = subResults[key];
              const dueAt = hw.due_at
                ? dayjs(hw.due_at).format('D MMMM YYYY')
                : null;
              return (
                <div
                  key={hw.id}
                  className={`px-5 py-5 ${idx > 0 ? 'border-t border-border/70' : ''}`}
                  data-testid={`yc-hw-${hw.id}`}
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold">{hw.title}</h3>
                        <Badge variant="outline" className="font-normal">
                          Yandex.Contest #{contestId}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {dueAt && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            до {dueAt}
                          </span>
                        )}
                        <a
                          href={`https://contest.yandex.ru/contest/${contestId}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          contest.yandex.ru
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onImport(contestId, key)}
                        disabled={busyId === key}
                        data-testid={`yc-import-hw-${hw.id}`}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        {busyId === key ? 'Импорт…' : 'Импортировать студентов'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onImportSubmissions(contestId, key)}
                        disabled={busyId === `sub-${key}`}
                        data-testid={`yc-sub-import-hw-${hw.id}`}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {busyId === `sub-${key}` ? 'Импорт…' : 'Импортировать посылки'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteHw(hw)}
                        disabled={deleteHwM.isPending}
                        className="text-destructive hover:text-destructive"
                        data-testid={`yc-delete-hw-${hw.id}`}
                        title="Удалить ДЗ из курса"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {r && <ResultLine r={r} />}
                  {sub && <SubLine s={sub} />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Manual fallback */}
      <Card className="border-border/70">
        <CardContent className="p-5">
          <form onSubmit={onManualSubmit} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="manual-contest-id">
                Импорт по ID вручную
              </Label>
              <Input
                id="manual-contest-id"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="73433"
                inputMode="numeric"
                pattern="[0-9]+"
                className="font-mono"
                data-testid="manual-contest-id"
              />
              <p className="text-xs text-muted-foreground">
                Если контеста нет в ДЗ выше — введите его ID и нажмите
                «Импортировать». ID — число из URL контеста на contest.yandex.ru.
              </p>
            </div>
            <Button
              type="submit"
              disabled={!manualId.trim() || busyId === `manual-${Number(manualId)}`}
              data-testid="manual-import-submit"
            >
              {busyId?.startsWith('manual-') ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Импортируем…
                </>
              ) : (
                'Импортировать'
              )}
            </Button>
          </form>
          {results[`manual-${Number(manualId)}`] && (
            <div className="mt-3">
              <ResultLine r={results[`manual-${Number(manualId)}`]!} />
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

function SubLine({ s }: { s: SubmissionsSummary }) {
  const failed = s.failed > 0 && s.fetched === 0;
  return (
    <div className="mt-2 text-xs">
      {failed ? (
        <span className="inline-flex items-start gap-1 text-sev-high">
          <AlertCircle className="mt-0.5 h-3 w-3 flex-none" />
          <span>{s.errors.join('; ')}</span>
        </span>
      ) : (
        <span className="inline-flex items-start gap-1 text-sev-low">
          <CheckCircle2 className="mt-0.5 h-3 w-3 flex-none" />
          <span>
            submissions: {s.fetched}
            {s.note && (
              <span className="ml-1 text-muted-foreground">· {s.note}</span>
            )}
          </span>
        </span>
      )}
    </div>
  );
}

function ResultLine({ r }: { r: ImportSummary }) {
  const failed = r.failed > 0 && r.imported === 0;
  return (
    <div className="mt-2 text-xs">
      {failed ? (
        <span className="inline-flex items-start gap-1 text-sev-high">
          <AlertCircle className="mt-0.5 h-3 w-3 flex-none" />
          <span>{r.errors.join('; ')}</span>
        </span>
      ) : (
        <span className="inline-flex items-start gap-1 text-sev-low">
          <CheckCircle2 className="mt-0.5 h-3 w-3 flex-none" />
          <span>
            participants: {r.imported}
            {r.identity && (
              <>
                {' '}
                · created {r.identity.created}, existing {r.identity.existing}
              </>
            )}
            {r.course && r.course.added !== undefined && (
              <> · enrolled {r.course.added}</>
            )}
            {r.course?.error && (
              <span className="text-sev-mid"> · enroll: {r.course.error}</span>
            )}
          </span>
        </span>
      )}
    </div>
  );
}



function SyncHistorySection({ configId }: { configId: string }) {
  const qc = useQueryClient();
  const notify = useNotifications();
  const syncM = useSyncNow(configId);

  const jobsQ = useQuery({
    queryKey: ['integration', configId, 'import-jobs'],
    queryFn: () => integrationsApi.listImportJobs(configId, { limit: 10 }),
    refetchInterval: 30_000, // refresh every 30s — autosync ticks every 5 min
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs: any[] = jobsQ.data?.data ?? [];

  const onSyncNow = async () => {
    try {
      await syncM.mutateAsync({});
      notify.success('Синхронизация запущена');
      // Give the backend a beat, then refetch.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: ['integration', configId, 'import-jobs'] }),
        1500,
      );
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось запустить');
    }
  };

  return (
    <Card className="border-border/70" data-testid="sync-history">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xl font-bold">Автосинхронизация</h2>
            <span className="text-xs text-muted-foreground">
              · каждые 5 минут
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onSyncNow}
            disabled={syncM.isPending}
            data-testid="sync-now-btn"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncM.isPending ? 'animate-spin' : ''}`} />
            Запустить сейчас
          </Button>
        </div>

        {jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            История появится после первого тика автосинка.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Когда</th>
                  <th className="px-3 py-2 text-left font-medium">Триггер</th>
                  <th className="px-3 py-2 text-left font-medium">Статус</th>
                  <th className="px-3 py-2 text-left font-medium">Результат</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const ok = j.status === 'completed';
                  const failed = j.status === 'failed';
                  const stats = j.stats ?? {};
                  return (
                    <tr
                      key={j.id}
                      className="border-t border-border/60 align-top"
                      data-testid={`job-row-${j.id}`}
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {dayjs(j.started_at ?? j.created_at).format(
                          'DD.MM HH:mm:ss',
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {j.trigger === 'scheduled' ? 'auto' : j.trigger}
                      </td>
                      <td className="px-3 py-2">
                        {ok && (
                          <span className="inline-flex items-center gap-1 text-sev-low">
                            <CheckCircle2 className="h-3 w-3" />
                            completed
                          </span>
                        )}
                        {failed && (
                          <span className="inline-flex items-center gap-1 text-sev-high">
                            <AlertCircle className="h-3 w-3" />
                            failed
                          </span>
                        )}
                        {!ok && !failed && (
                          <span className="text-muted-foreground">{j.status}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {stats.contests !== undefined && (
                          <>
                            {stats.contests} контестов · participants{' '}
                            {stats.participants_imported ?? 0}
                            {stats.users_created
                              ? ` · created ${stats.users_created}`
                              : ''}
                            {stats.members_enrolled
                              ? ` · enrolled ${stats.members_enrolled}`
                              : ''}
                            {stats.submissions_fetched
                              ? ` · submissions ${stats.submissions_fetched}`
                              : ''}
                          </>
                        )}
                        {j.error?.detail && (
                          <span className="block text-sev-high">
                            {String(j.error.detail).slice(0, 120)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
