/**
 * MySubmissionDetailPage — `/me/submissions/:id`, student view.
 *
 * Stripped to the bare facts a student needs:
 *
 *   • Header: assignment title, submitted-at, language. No internal
 *     ``ASSIGNMENT 12`` / ``sub_…`` ids — those leaked DB plumbing.
 *   • Code: inline (one CodeViewer; teacher may comment on a line).
 *   • Grade: a single line with score + multiplier + graded-at.
 *   • Teacher feedback (when `grade.comment` / per-line feedback is on
 *     and `visible_to_student` is true).
 *
 * Things the staff page has and the student doesn't need (removed):
 *   • Files picker — a Y.Contest submission is one file; the picker
 *     is dead chrome.
 *   • Plagiarism number / blurb — not actionable for the student.
 *   • «Открыть входящие» footer button — that's the staff inbox.
 *   • Duplicate «К заданию» at the bottom — one in the header is enough.
 */
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  useFeedback,
  useGrade,
  useSubmission,
  useSubmissionFileContent,
  useSubmissionFiles,
} from '@/hooks/api/useSubmissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation, type TParams } from '@/i18n';
import { CodeViewer } from '@/components/submissions/CodeViewer';
import { PdfFileView, isPdfFile } from '@/components/submissions/PdfFileView';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/layout/Page';

function relTime(
  iso: string | Date | null | undefined,
  t: (key: string, params?: TParams) => string,
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return t('my_sub.time.just_now');
  if (minutes < 60) return t('my_sub.time.minutes_ago', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('my_sub.time.hours_ago', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('my_sub.time.days_ago', { count: days });
  const months = Math.round(days / 30);
  if (months < 12) return t('my_sub.time.months_ago', { count: months });
  const years = Math.round(months / 12);
  return t('my_sub.time.years_ago', { count: years });
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
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: submission, isLoading } = useSubmission(id);
  const { data: filesData } = useSubmissionFiles(id);
  const files = filesData?.data ?? [];
  // Y.Contest submissions are single-file; we don't expose a picker.
  // If multiple files ever land here we just render the first one — the
  // student rarely needs to navigate between siblings.
  const file = files[0];
  const fileId = file?.id;
  // PDF submissions (math / scans) get the real PDF viewer, not the text
  // CodeViewer — and we skip the (binary-garbage) text fetch for them.
  const isPdf = isPdfFile(file);
  const { data: fileContent } = useSubmissionFileContent(
    id,
    isPdf ? undefined : fileId,
  );
  const { data: grade } = useGrade(id);
  const { data: feedbackData } = useFeedback(id);
  const feedback = (feedbackData?.data ?? []).filter(
    (f) => f.visible_to_student,
  );

  const sub = submission as
    | (typeof submission & {
        assignment_title?: string | null;
        homework_title?: string | null;
        course_name?: string | null;
      })
    | null
    | undefined;
  const titleStr = sub?.assignment_title || t('my_sub.fallback_title');
  useDocumentTitle(titleStr);

  if (!id) return null;
  if (isLoading || !submission || !sub) {
    // Mirror the real layout: header (title + meta, back-button on the
    // right) → the dominant bordered code panel → a quiet grade line.
    return (
      <Page>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 min-w-0">
            <Skeleton className="h-3 w-40 rounded-md bg-muted/40" />
            <Skeleton className="h-8 w-1/2 rounded-md bg-muted/50" />
            <Skeleton className="h-3 w-1/3 rounded-md bg-muted/30" />
          </div>
          <Skeleton className="h-8 w-40 flex-none rounded-md bg-muted/30" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border/70">
          <Skeleton className="h-[18rem] w-full rounded-none bg-muted/40" />
        </div>
        <section className="space-y-2 border-t border-border/40 pt-5">
          <Skeleton className="h-3 w-20 rounded-md bg-muted/30" />
          <Skeleton className="h-7 w-32 rounded-md bg-muted/50" />
        </section>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 min-w-0">
          {/* Context line above the title — «<course> · <homework>» so
              the student knows which assignment they're looking at
              without scrolling back to the dashboard. Falls through
              gracefully when the backend didn't denormalise these
              (legacy rows / non-Y.Contest sources). */}
          {(sub.course_name || sub.homework_title) && (
            <div className="text-xs text-muted-foreground truncate">
              {[sub.course_name, sub.homework_title].filter(Boolean).join(' · ')}
            </div>
          )}
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight truncate">
            {titleStr}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('my_sub.submitted_at', {
              date: dayjs(sub.submitted_at).format('DD.MM.YYYY HH:mm'),
            })}
            {sub.is_late && (
              <>
                {' · '}
                <span className="text-sev-mid">{t('my_sub.late')}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex-none">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/assignments/${sub.assignment_id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('my_sub.back_to_assignment')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Submission file — a real PDF viewer for math/scan submissions,
          otherwise the inline CodeViewer (teachers may comment on a line,
          so the student sees the same view a teacher sees). */}
      {file && isPdf ? (
        <PdfFileView submissionId={id} file={file} />
      ) : (
        fileContent && (
          <div className="overflow-hidden rounded-lg border border-border/70">
            <CodeViewer
              fileName={file?.path ?? '—'}
              code={fileContent}
              language={sub.language}
              maxHeight={520}
            />
          </div>
        )
      )}

      {/* Grade — one quiet line: «Оценка 8.5 / 10  ×1.0  · 15.05.2026 14:32». */}
      {grade && (
        <section
          className="space-y-2 border-t border-border/40 pt-5"
          data-testid={`grade-${id}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {t('my_sub.grade')}
            </h2>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {grade.score.toFixed(1)}
              <span className="text-muted-foreground">
                {' '}
                / {grade.max_score.toFixed(1)}
              </span>
            </span>
            {grade.applied_multiplier !== 1 && (
              <span className="text-sm text-muted-foreground">
                ×{grade.applied_multiplier.toFixed(2)}
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              · {dayjs(grade.graded_at).format('DD.MM.YYYY HH:mm')}
            </span>
          </div>
          {/* The teacher's overall comment from the grade form. Previously
              only per-line / LLM ``feedback`` rows were shown below, so a
              plain grade comment never reached the student. */}
          {grade.comment && grade.comment.trim() && (
            <div className="mt-1 max-w-[760px] border-l-2 border-border pl-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('my_sub.teacher_comment')}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {grade.comment}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Feedback — comments from the teacher (or curated LLM summary). */}
      {feedback.length > 0 && (
        <section className="space-y-3 border-t border-border/40 pt-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t('my_sub.feedback')}
          </h2>
          <ul className="space-y-4">
            {feedback.map((f) => (
              <li key={f.id} className="flex gap-3">
                <Avatar className="h-8 w-8 flex-none">
                  <AvatarFallback className="bg-muted text-xs text-foreground/80">
                    {initials(f.author_id)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {relTime(f.created_at, t)}
                    {f.source === 'llm_curated' && (
                      <>
                        {' · '}
                        <span className="text-primary">{t('my_sub.llm_summary')}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1.5 max-w-[760px] whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                    {f.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
