/**
 * CourseDashboardPage — teacher/owner/co_owner/assistant view of a single course.
 *
 * Tabs: Overview / Grades / Plagiarism / AI / Timeline / Languages /
 *       Activity / Late.
 */
import { lazy, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BarChart3,
  Book,
  BookOpen,
  Brain,
  ClipboardList,
  Clock,
  History,
  Languages,
  Loader2,
  Shield,
  Users,
} from 'lucide-react';
import {
  useCourseAIUsage,
  useCourseDashboard,
  useCourseGradesByAssignment,
  useCourseGradesDist,
  useCourseLanguageBreakdown,
  useCourseLateSubmissions,
  useCoursePlagiarismStats,
  useCourseRecentActivity,
  useCourseTimeline,
} from '@/hooks/api/useDashboards';
import { useCourse } from '@/hooks/api/useCourses';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { KPICard } from '@/components/dashboard/KPICard';
// Chart components pull recharts (~70 KB gz) — defer them through
// React.lazy so the KPI grid + tab strip render immediately and each
// chart streams in only when its tab is active.
const GradeHistogram = lazy(() =>
  import('@/components/dashboard/GradeHistogram').then((m) => ({ default: m.GradeHistogram })),
);
const SubmissionsTimeline = lazy(() =>
  import('@/components/dashboard/SubmissionsTimeline').then((m) => ({ default: m.SubmissionsTimeline })),
);
const LanguagePie = lazy(() =>
  import('@/components/dashboard/LanguagePie').then((m) => ({ default: m.LanguagePie })),
);
const AIUsageDonut = lazy(() =>
  import('@/components/dashboard/AIUsageDonut').then((m) => ({ default: m.AIUsageDonut })),
);
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { LateSubmissionsList } from '@/components/dashboard/LateSubmissionsList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/Page';

/** Tiny inline spinner for the recharts-bearing tab panels while
 *  the chunk loads on first tab activation. After that the chunk
 *  is cached and the fallback flickers for <50ms. */
function ChartLoader() {
  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function CourseDashboardPage() {
  useDocumentTitle('Дашборд курса');
  const { slug } = useParams<{ slug: string }>();
  const { data: course } = useCourse(slug);
  const courseId = course?.id;

  const overview = useCourseDashboard(courseId);
  const gradesDist = useCourseGradesDist(courseId);
  const gradesByAssign = useCourseGradesByAssignment(courseId);
  const plagiarism = useCoursePlagiarismStats(courseId);
  const ai = useCourseAIUsage(courseId);
  const timeline = useCourseTimeline(courseId);
  const languages = useCourseLanguageBreakdown(courseId);
  const activity = useCourseRecentActivity(courseId);
  const late = useCourseLateSubmissions(courseId);

  // Backend returns KPI fields flatly (no nested `kpi` object).
  const kpi = overview.data;
  const isLoading = overview.isLoading;

  return (
    <Page width="wide">
      <PageHeader
        title="Дашборд курса"
        action={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={`/courses/${slug}/exports`}>Экспорты</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/courses/${slug}/scheduled-exports`}>Расписание</Link>
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Обзор
          </TabsTrigger>
          <TabsTrigger value="grades" className="gap-1.5">
            <Book className="h-3.5 w-3.5" />
            Оценки
          </TabsTrigger>
          <TabsTrigger value="plagiarism" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Плагиат
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            AI
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Таймлайн
          </TabsTrigger>
          <TabsTrigger value="languages" className="gap-1.5">
            <Languages className="h-3.5 w-3.5" />
            Языки
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Активность
          </TabsTrigger>
          <TabsTrigger value="late" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Опоздания
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          data-testid="tab-overview"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <KPICard
            label="Студентов"
            value={kpi?.enrolled_students}
            icon={<Users className="h-4 w-4" />}
            loading={isLoading}
            testId="kpi-enrolled-students"
          />
          <KPICard
            label="Заданий"
            value={kpi?.assignments_count}
            icon={<ClipboardList className="h-4 w-4" />}
            loading={isLoading}
            testId="kpi-assignments-count"
          />
          <KPICard
            label="Посылок"
            value={kpi?.submissions_total}
            icon={<BookOpen className="h-4 w-4" />}
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
            label="AI-запусков"
            value={kpi?.ai_runs_count}
            icon={<Brain className="h-4 w-4" />}
            color="grape"
            loading={isLoading}
            testId="kpi-ai-runs"
          />
        </TabsContent>

        <TabsContent
          value="grades"
          data-testid="tab-grades"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <div className="lg:col-span-7">
            <Suspense fallback={<ChartLoader />}>
              <GradeHistogram
                data={gradesDist.data}
                loading={gradesDist.isLoading}
              />
            </Suspense>
          </div>
          <div className="lg:col-span-5">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <span className="font-medium">Средние по заданиям</span>
                  {gradesByAssign.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex flex-col gap-1">
                      {(gradesByAssign.data ?? []).map((it) => (
                        <div
                          key={it.assignment_id}
                          data-testid={`avg-${it.assignment_id}`}
                          className="flex items-center justify-between text-sm"
                        >
                          <span>{it.assignment_title}</span>
                          <span className="font-medium">
                            {it.average_score?.toFixed(2) ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="plagiarism"
          data-testid="tab-plagiarism"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <div className="lg:col-span-8">
            <Suspense fallback={<ChartLoader />}>
              <SubmissionsTimeline
                data={(plagiarism.data?.series ?? []).map((p) => ({
                  week: p.date,
                  submissions: p.pairs_suspected,
                  graded: Math.round(p.max_similarity * 10) / 10,
                }))}
              />
            </Suspense>
          </div>
          <div className="lg:col-span-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">Сводка</span>
                  <p className="text-sm">
                    Запусков: {plagiarism.data?.total_runs ?? 0}
                  </p>
                  <p className="text-sm">
                    Подозрительных пар:{' '}
                    {plagiarism.data?.total_pairs_flagged ?? 0}
                  </p>
                  <p className="mt-3 font-medium text-sm">По языкам</p>
                  {(plagiarism.data?.by_language ?? []).map((l) => (
                    <div
                      key={l.language}
                      data-testid={`plag-lang-${l.language}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{l.language}</span>
                      <span>{l.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="ai"
          data-testid="tab-ai"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <div className="lg:col-span-5">
            <Suspense fallback={<ChartLoader />}>
              <AIUsageDonut data={ai.data} />
            </Suspense>
          </div>
          <div className="lg:col-span-7">
            <Suspense fallback={<ChartLoader />}>
              <SubmissionsTimeline
                data={(ai.data?.series ?? []).map((p) => ({
                  week: p.date,
                  submissions: p.runs,
                  graded: Math.round(p.cost_usd * 100) / 100,
                }))}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="timeline" data-testid="tab-timeline">
          <Suspense fallback={<ChartLoader />}>
            <SubmissionsTimeline data={timeline.data} />
          </Suspense>
        </TabsContent>

        <TabsContent value="languages" data-testid="tab-languages">
          <Suspense fallback={<ChartLoader />}>
            <LanguagePie data={languages.data} />
          </Suspense>
        </TabsContent>

        <TabsContent value="activity" data-testid="tab-activity">
          <ActivityFeed events={activity.data} />
        </TabsContent>

        <TabsContent value="late" data-testid="tab-late">
          <LateSubmissionsList items={late.data} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
