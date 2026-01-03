/**
 * CourseStatsPage — embedded course stats overview.
 *
 * Shows the same KPI cards / grade distribution / suspicious submissions /
 * activity timeline that the Reporting Service powers, condensed into one
 * scrollable page (no tabs). For the full multi-tab dashboard use
 * /courses/:slug/dashboard.
 */
import { Link, useParams } from 'react-router-dom';
import { BarChart3, Book, Brain, ClipboardList, Loader2, Shield, Users } from 'lucide-react';
import { useCourse } from '@/hooks/api/useCourses';
import {
  useCourseDashboard,
  useCourseGradesDist,
  useCourseRecentActivity,
  useCourseTimeline,
} from '@/hooks/api/useDashboards';
import { useSuspiciousSubmissions } from '@/hooks/api/usePlagiarism';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Card, CardContent } from '@/components/ui/card';
import { KPICard } from '@/components/dashboard/KPICard';
import { GradeHistogram } from '@/components/dashboard/GradeHistogram';
import { SubmissionsTimeline } from '@/components/dashboard/SubmissionsTimeline';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';

export default function CourseStatsPage() {
  useDocumentTitle('Статистика курса');
  const { slug } = useParams<{ slug: string }>();
  const { data: course } = useCourse(slug);
  const courseId = course?.id;

  const overview = useCourseDashboard(courseId);
  const gradesDist = useCourseGradesDist(courseId);
  const timeline = useCourseTimeline(courseId);
  const activity = useCourseRecentActivity(courseId);
  const suspicious = useSuspiciousSubmissions(courseId, {
    limit: 5,
    dismissed: 'active',
  });

  // Backend returns KPI fields flatly (no nested `kpi` object).
  const kpi = overview.data;
  const isLoading = overview.isLoading;

  // Top-3-5 suspicious pairs above similarity > 0.7.
  const suspiciousList = (suspicious.data?.data ?? [])
    .filter((s) => (s.similarity ?? 0) > 0.7)
    .slice(0, 5);

  return (
    <Page width="wide">
      <PageHeader
        title={<span data-testid="course-stats-title">Статистика</span>}
        action={
          courseId ? (
            <Link
              to={`/courses/${slug}/dashboard`}
              className="text-primary hover:underline text-sm"
            >
              Полный дашборд →
            </Link>
          ) : undefined
        }
      />

      <div data-testid="course-stats" className="space-y-4">
        {!courseId && !overview.isLoading ? (
          <EmptyState title="Нет данных" message="Курс не найден." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KPICard
                label="Посылок"
                value={kpi?.submissions_total}
                icon={<Book className="h-4 w-4" />}
                loading={isLoading}
                testId="kpi-submissions-total"
              />
              <KPICard
                label="Средняя оценка"
                value={kpi?.average_score ?? null}
                icon={<BarChart3 className="h-4 w-4" />}
                color="blue"
                loading={isLoading}
                testId="kpi-avg-score"
              />
              <KPICard
                label="Plagiarism alerts"
                value={kpi?.plagiarism_alerts_count}
                icon={<Shield className="h-4 w-4" />}
                color="red"
                loading={isLoading}
                testId="kpi-plagiarism-alerts"
              />
              <KPICard
                label="Студентов"
                value={kpi?.enrolled_students}
                icon={<Users className="h-4 w-4" />}
                loading={isLoading}
                testId="kpi-enrolled-students"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-7">
                <GradeHistogram
                  data={gradesDist.data}
                  loading={gradesDist.isLoading}
                />
              </div>
              <div className="md:col-span-5">
                <Card data-testid="course-stats-suspicious-card">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">Подозрительные посылки</p>
                      {courseId && (
                        <Link
                          to={`/courses/${slug}/suspicious`}
                          className="text-primary hover:underline text-sm"
                        >
                          Все →
                        </Link>
                      )}
                    </div>
                    {suspicious.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : suspiciousList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Нет подозрительных посылок выше 70% сходства.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {suspiciousList.map((s) => (
                          <div
                            key={s.flag_id}
                            className="flex items-center justify-between gap-3"
                            data-testid={`suspicious-row-${s.flag_id}`}
                          >
                            <Link
                              to={`/submissions/${s.submission_id}`}
                              className="text-primary hover:underline text-sm"
                            >
                              {s.author?.display_name ?? s.submission_id.slice(0, 12)}
                            </Link>
                            <span className="text-sm font-medium text-sev-high">
                              {s.similarity != null
                                ? `${Math.round(s.similarity * 100)}%`
                                : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-7">
                <SubmissionsTimeline data={timeline.data} />
              </div>
              <div className="md:col-span-5">
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <p className="font-semibold">KPI</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Заданий</span>
                      <span className="text-sm font-medium">
                        {kpi?.assignments_count ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">AI-запусков</span>
                      <span className="text-sm font-medium inline-flex items-center gap-1">
                        <Brain className="h-3 w-3" />
                        {kpi?.ai_runs_count ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">AI tokens</span>
                      <span className="text-sm font-medium">
                        {kpi?.ai_tokens_used ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        Последняя активность
                      </span>
                      <span className="text-sm font-medium inline-flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" />
                        {kpi?.last_activity_at
                          ? new Date(kpi.last_activity_at).toLocaleDateString('ru-RU')
                          : '—'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <ActivityFeed events={activity.data} />
          </>
        )}
      </div>
    </Page>
  );
}
