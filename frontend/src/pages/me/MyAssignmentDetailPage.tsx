/**
 * MyAssignmentDetailPage — student view of a single assignment at
 * /me/assignments/:id.
 *
 * Title block with course/code eyebrow + due chip, a Markdown-ish description,
 * and a "submission status" panel that surfaces the student's most recent
 * posting along with a one-click upload affordance. Versions listed below.
 *
 * The teacher-side detail page lives at /assignments/:id and is unchanged.
 */
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ChevronRight, Upload } from 'lucide-react';
import { useAssignment } from '@/hooks/api/useAssignments';
import { useCourse } from '@/hooks/api/useCourses';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/auth/useAuth';
import type { SubmissionBrief } from '@/api/endpoints/submissions';
import { SkeletonList } from '@/components/common/Skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page } from '@/components/layout/Page';

type DueTone = 'high' | 'mid' | 'low' | 'muted';

function dueText(dueAt: string | null | undefined): {
  label: string;
  tone: DueTone;
} {
  if (!dueAt) return { label: 'без дедлайна', tone: 'muted' };
  const now = Date.now();
  const target = new Date(dueAt).getTime();
  const minutes = Math.round((target - now) / 60_000);
  if (minutes < 0) {
    const hours = Math.round(Math.abs(minutes) / 60);
    if (hours >= 24)
      return {
        label: `просрочено на ${Math.round(hours / 24)} д.`,
        tone: 'high',
      };
    return { label: `просрочено на ${hours} ч.`, tone: 'high' };
  }
  if (minutes < 60) return { label: `до ${minutes} мин.`, tone: 'mid' };
  if (minutes < 1440)
    return { label: `до ${Math.round(minutes / 60)} ч.`, tone: 'mid' };
  const days = Math.round(minutes / 1440);
  return {
    label: `до ${days} д.`,
    tone: days <= 2 ? 'mid' : 'low',
  };
}

const toneText: Record<DueTone, string> = {
  high: 'text-sev-high',
  mid: 'text-sev-mid',
  low: 'text-muted-foreground',
  muted: 'text-muted-foreground',
};

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

export default function MyAssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Задание');
  const { user } = useAuth();
  const { data: assignment, isLoading } = useAssignment(id);
  const { data: subsData } = useMySubmissions({ limit: 20 });
  const submissions: SubmissionBrief[] = (subsData?.data ?? []).filter(
    (s) => s.assignment_id === id,
  );
  const latest = submissions[0];
  const { data: course } = useCourse(assignment?.course_id);

  if (!id) return null;
  if (isLoading || !assignment) {
    return (
      <div className="space-y-6">
        <SkeletonList rows={5} rowHeight={48} />
      </div>
    );
  }

  const due = dueText(assignment.due_at);

  return (
    <Page>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {course?.name ?? assignment.course_id}
          </div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">
            {assignment.title}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Дедлайн:{' '}
              <span className={toneText[due.tone]}>
                {assignment.due_at
                  ? dayjs(assignment.due_at).format('DD.MM HH:mm')
                  : '—'}{' '}
                · {due.label}
              </span>
            </span>
            <span>·</span>
            <span>Язык: {assignment.language_hint ?? '—'}</span>
            <span>·</span>
            <span>
              {submissions.length > 0
                ? `${submissions.length} попыт.`
                : 'без попыток'}
            </span>
          </p>
        </div>
        <div className="flex-none">
          {latest ? (
            <Button asChild variant="outline">
              <Link to={`/me/submissions/${latest.id}`}>
                Открыть посылку
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to={`/assignments/${id}/upload`}>
                <Upload className="mr-2 h-4 w-4" />
                Загрузить решение
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Условие</h2>
        <Card className="border-border/70">
          <CardContent className="p-5 text-sm leading-relaxed text-foreground/80">
            <p className="max-w-[760px] whitespace-pre-wrap">
              {assignment.description ||
                'Описание задания появится здесь, когда преподаватель его опубликует.'}
            </p>
            {assignment.max_score != null && (
              <div className="mt-4 text-xs text-muted-foreground">
                Максимум:{' '}
                <span className="tabular-nums">{assignment.max_score}</span> ·
                Вес:{' '}
                <span className="tabular-nums">{assignment.weight ?? 1}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Submission status */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Моя посылка</h2>
          <Button asChild variant="outline" size="sm">
            <Link to={`/assignments/${id}/upload`}>
              <Upload className="mr-2 h-4 w-4" />
              Новая попытка
            </Link>
          </Button>
        </div>

        {!latest ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Посылок пока нет — загрузите решение, чтобы начать.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70">
            <CardContent className="p-0">
              <Link
                to={`/me/submissions/${latest.id}`}
                data-testid={`my-assignment-latest-${latest.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                    {initials(user?.display_name ?? '—')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    Попытка{' '}
                    <span className="tabular-nums">v{latest.version}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      последняя
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {relTime(latest.submitted_at)} · {latest.language} ·{' '}
                    {latest.status}
                    {latest.is_late && (
                      <>
                        {' · '}
                        <span className="text-sev-mid">late</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Version history */}
      {submissions.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">История попыток</h2>
          <Card className="border-border/70">
            <CardContent className="p-0">
              {submissions.slice(1).map((s, idx) => (
                <Link
                  key={s.id}
                  to={`/me/submissions/${s.id}`}
                  className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                    idx > 0 ? 'border-t border-border/70' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      v{s.version}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {relTime(s.submitted_at)} · {s.language}
                    </div>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {typeof s.score === 'number' ? s.score.toFixed(1) : '—'}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Bottom action — back link */}
      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/me/assignments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ко всем заданиям
          </Link>
        </Button>
      </div>
    </Page>
  );
}
