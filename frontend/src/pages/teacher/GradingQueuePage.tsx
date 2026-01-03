/**
 * Teacher "На проверке" — overview of all assignments the teacher owns,
 * grouped by course, with quick links to grade submissions per assignment.
 *
 * Backend doesn't expose a flat "ungraded across all my assignments" feed
 * yet; the closest first-class endpoint is per-assignment, so we present
 * a navigation board over the teacher's courses + assignments.
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonList } from '@/components/common/Skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useCourses } from '@/hooks/api/useCourses';
import { useMyAssignments } from '@/hooks/api/useAssignments';

const fmtDeadline = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
      })
    : 'без дедлайна';

export default function GradingQueuePage() {
  useDocumentTitle('На проверке');
  const coursesQ = useCourses({ limit: 50 });
  const assignmentsQ = useMyAssignments();

  const courses = Array.isArray(coursesQ.data)
    ? coursesQ.data
    : ((coursesQ.data as any)?.data ?? []);
  const assignments: any[] = Array.isArray(assignmentsQ.data)
    ? assignmentsQ.data
    : ((assignmentsQ.data as any)?.data ?? []);

  const byCourse = new Map<string, any[]>();
  for (const a of assignments) {
    const list = byCourse.get(String(a.course_id)) ?? [];
    list.push(a);
    byCourse.set(String(a.course_id), list);
  }

  const isPending = coursesQ.isPending || assignmentsQ.isPending;
  const hasNothingYet =
    isPending && courses.length === 0 && assignments.length === 0;

  return (
    <Page width="regular">
      <PageHeader title="На проверке" />

      {hasNothingYet ? (
        <SkeletonList rows={4} rowHeight={64} />
      ) : courses.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 px-6 text-sm text-muted-foreground">
          У вас ещё нет курсов в этом тенанте.{' '}
          <Link to="/courses/new" className="text-primary hover:underline">
            Создать курс →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {courses.map((c: any) => {
            const courseAssignments = byCourse.get(String(c.id)) ?? [];
            return (
              <section key={c.id} className="space-y-3">
                <div className="flex items-baseline gap-3 border-b pb-3">
                  <h2 className="text-base font-semibold tracking-tight">
                    {c.name}
                  </h2>
                  <div className="flex-1" />
                  <Link
                    to={`/courses/${c.slug ?? c.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Открыть курс →
                  </Link>
                </div>
                {courseAssignments.length === 0 ? (
                  <div className="py-5 text-sm text-muted-foreground">
                    В этом курсе пока нет заданий.
                  </div>
                ) : (
                  <Card className="border-border/70">
                    <CardContent className="p-0">
                      {courseAssignments.map((a: any, idx: number) => (
                        <Link
                          key={a.id}
                          to={`/assignments/${a.id}`}
                          data-testid={`grading-assignment-${a.id}`}
                          className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                            idx > 0 ? 'border-t border-border/70' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">
                              {a.title}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {a.language_hint ?? 'без языка'} · до{' '}
                              {fmtDeadline(a.deadline_hard_at)} · max{' '}
                              <span className="tabular-nums">
                                {a.max_score ?? '—'}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
