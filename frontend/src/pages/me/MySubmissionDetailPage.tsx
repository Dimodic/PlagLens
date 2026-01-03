/**
 * MySubmissionDetailPage — student view of a submission at /me/submissions/:id.
 *
 * Quiet header with the assignment + version + uploaded-at, a code viewer for
 * the student's own file, a grade card (only when the rubric became visible to
 * students), a single similarity number (no pairs are exposed to the student),
 * and a shared AI summary if the teacher published one.
 *
 * The teacher-side detail at /submissions/:id stays mounted at its existing
 * page and is unchanged.
 */
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  useFeedback,
  useGrade,
  useSubmission,
  useSubmissionFileContent,
  useSubmissionFiles,
} from '@/hooks/api/useSubmissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { CodeViewer } from '@/components/submissions/CodeViewer';
import { SkeletonList } from '@/components/common/Skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page } from '@/components/layout/Page';

function relTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} д назад`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} мес назад`;
  const years = Math.round(months / 12);
  return `${years} г назад`;
}

function initials(name?: string | null): string {
  if (!name) return 'PL';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function MySubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Моя посылка');
  const { data: submission, isLoading } = useSubmission(id);
  const { data: filesData } = useSubmissionFiles(id);
  const files = filesData?.data ?? [];
  const [activeFileId, setActiveFileId] = useState<string | undefined>(
    undefined,
  );
  const fileId = activeFileId ?? files[0]?.id;
  const { data: fileContent } = useSubmissionFileContent(id, fileId);
  const { data: grade } = useGrade(id);
  const { data: feedbackData } = useFeedback(id);
  const feedback = (feedbackData?.data ?? []).filter(
    (f) => f.visible_to_student,
  );

  if (!id) return null;
  if (isLoading || !submission) {
    return (
      <div className="space-y-6">
        <SkeletonList rows={6} rowHeight={48} />
      </div>
    );
  }

  const flagged =
    !!submission.flags?.suspicious || !!submission.flags?.manually_flagged;

  const submissionAny = submission as unknown as {
    plagiarism?: { max_similarity?: number };
    last_run_score?: number;
    similarity_score?: number;
    plagiarism_runs?: Array<{ score?: number; max_similarity?: number }>;
  };
  const similarityRaw =
    submissionAny.plagiarism?.max_similarity ??
    submissionAny.last_run_score ??
    submissionAny.similarity_score ??
    submissionAny.plagiarism_runs?.[0]?.max_similarity ??
    submissionAny.plagiarism_runs?.[0]?.score ??
    null;
  const similarity = typeof similarityRaw === 'number' ? similarityRaw : null;
  const hasSimilarity = similarity !== null;

  const similarityToneClass = hasSimilarity
    ? (similarity as number) >= 0.65
      ? 'text-sev-high'
      : (similarity as number) >= 0.4
        ? 'text-sev-mid'
        : 'text-sev-low'
    : 'text-muted-foreground';

  return (
    <Page>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            assignment {submission.assignment_id}
          </div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">
            Посылка{' '}
            <span className="tabular-nums">v{submission.version}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Загружено{' '}
            {dayjs(submission.submitted_at).format('DD.MM.YYYY HH:mm')} ·{' '}
            {submission.language} · {submission.status}
            {submission.is_late && (
              <>
                {' · '}
                <span className="text-sev-mid">late</span>
              </>
            )}
          </p>
        </div>
        <div className="flex-none">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/me/assignments/${submission.assignment_id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              К заданию
            </Link>
          </Button>
        </div>
      </div>

      {/* Files */}
      {files.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Файлы</h2>
          <div className="flex flex-wrap gap-1 overflow-x-auto">
            {files.map((f) => {
              const on = (activeFileId ?? files[0]?.id) === f.id;
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => setActiveFileId(f.id)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
                    on
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  {f.path}
                </button>
              );
            })}
          </div>
          {fileContent && (
            <div className="overflow-hidden rounded-lg border border-border/70">
              <CodeViewer
                fileName={files.find((f) => f.id === fileId)?.path ?? '—'}
                code={fileContent}
                language={submission.language}
                maxHeight={420}
              />
            </div>
          )}
        </section>
      )}

      {/* Grade */}
      {grade && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Оценка</h2>
          <Card className="border-border/70">
            <CardContent className="grid grid-cols-1 gap-6 p-5 md:grid-cols-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Балл
                </div>
                <div
                  className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"
                  data-testid={`grade-${id}`}
                >
                  {grade.score.toFixed(1)} / {grade.max_score.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Множитель
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                  ×{grade.applied_multiplier.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Дата
                </div>
                <div className="mt-2 text-sm text-foreground/80">
                  {dayjs(grade.graded_at).format('DD.MM.YYYY HH:mm')}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Feedback */}
      {feedback.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Комментарий преподавателя</h2>
          <Card className="border-border/70">
            <CardContent className="p-0">
              {feedback.map((f, idx) => (
                <div
                  key={f.id}
                  className={`flex gap-4 px-5 py-4 ${
                    idx > 0 ? 'border-t border-border/70' : ''
                  }`}
                >
                  <Avatar className="h-9 w-9 flex-none">
                    <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                      {initials(f.author_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      {relTime(f.created_at)}
                      {f.source === 'llm_curated' && (
                        <>
                          {' · '}
                          <span className="text-primary">LLM-сводка</span>
                        </>
                      )}
                    </div>
                    <p className="mt-2 max-w-[760px] whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                      {f.body}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Plagiarism — students only see a single number */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Антиплагиат</h2>
          {hasSimilarity ? (
            <span
              className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${similarityToneClass}`}
            >
              {Math.round((similarity as number) * 100)}%
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        <Card className="border-border/70">
          <CardContent className="p-5 text-sm leading-relaxed text-foreground/80">
            <p className="max-w-[760px]">
              {!hasSimilarity
                ? 'Проверка на сходство ещё не запускалась.'
                : flagged
                  ? 'Найдено существенное сходство с другим решением. Преподаватель может попросить вас рассказать, как вы пришли к этому решению.'
                  : 'Сходство ниже порога — задание принято к проверке.'}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Bottom actions */}
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link to={`/me/assignments/${submission.assignment_id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            К заданию
          </Link>
        </Button>
        <Button asChild variant="ghost" aria-label="Открыть входящие">
          <Link to="/notifications">Открыть входящие</Link>
        </Button>
      </div>
    </Page>
  );
}
