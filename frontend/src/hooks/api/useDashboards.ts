/**
 * React Query hooks for Reporting Service dashboard endpoints.
 */
import { useQuery } from '@tanstack/react-query';
import { reportingApi } from '@/api/endpoints/reporting';

export const dashboardKeys = {
  all: ['dashboards'] as const,
  myDashboard: () => ['dashboards', 'me'] as const,
  myActivity: () => ['dashboards', 'me', 'activity'] as const,
  myProgress: () => ['dashboards', 'me', 'progress'] as const,
  course: (id: string) => ['dashboards', 'course', id] as const,
  courseGradesDist: (id: string) =>
    ['dashboards', 'course', id, 'grades-dist'] as const,
  courseGradesByAssign: (id: string) =>
    ['dashboards', 'course', id, 'grades-by-assignment'] as const,
  coursePlagiarism: (id: string) =>
    ['dashboards', 'course', id, 'plagiarism'] as const,
  courseAI: (id: string) => ['dashboards', 'course', id, 'ai'] as const,
  courseTimeline: (id: string) =>
    ['dashboards', 'course', id, 'timeline'] as const,
  courseActive: (id: string) =>
    ['dashboards', 'course', id, 'active'] as const,
  courseStragglers: (id: string) =>
    ['dashboards', 'course', id, 'stragglers'] as const,
  courseLate: (id: string) => ['dashboards', 'course', id, 'late'] as const,
  courseLanguages: (id: string) =>
    ['dashboards', 'course', id, 'languages'] as const,
  courseActivity: (id: string) =>
    ['dashboards', 'course', id, 'activity'] as const,
  tenant: (id: string) => ['dashboards', 'tenant', id] as const,
  tenantIntegrations: (id: string) =>
    ['dashboards', 'tenant', id, 'integrations'] as const,
  instance: () => ['dashboards', 'instance'] as const,
  instanceIntegrations: () => ['dashboards', 'instance', 'integrations'] as const,
  global: () => ['dashboards', 'global'] as const,
};

export function useMyDashboard() {
  return useQuery({
    queryKey: dashboardKeys.myDashboard(),
    queryFn: () => reportingApi.myDashboard(),
  });
}

export function useMyRecentActivity() {
  return useQuery({
    queryKey: dashboardKeys.myActivity(),
    queryFn: () => reportingApi.myRecentActivity(),
  });
}

export function useMyProgress() {
  return useQuery({
    queryKey: dashboardKeys.myProgress(),
    queryFn: () => reportingApi.myProgress(),
  });
}

export function useCourseDashboard(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.course(courseId ?? ''),
    queryFn: () => reportingApi.courseDashboard(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseGradesDist(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseGradesDist(courseId ?? ''),
    queryFn: () => reportingApi.gradesDistribution(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseGradesByAssignment(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseGradesByAssign(courseId ?? ''),
    queryFn: () => reportingApi.gradesByAssignment(courseId as string),
    enabled: !!courseId,
  });
}

export function useCoursePlagiarismStats(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.coursePlagiarism(courseId ?? ''),
    queryFn: () => reportingApi.plagiarismStats(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseAIUsage(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseAI(courseId ?? ''),
    queryFn: () => reportingApi.aiUsage(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseTimeline(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseTimeline(courseId ?? ''),
    queryFn: () => reportingApi.timeline(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseActiveStudents(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseActive(courseId ?? ''),
    queryFn: () => reportingApi.activeStudents(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseStragglers(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseStragglers(courseId ?? ''),
    queryFn: () => reportingApi.stragglers(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseLateSubmissions(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseLate(courseId ?? ''),
    queryFn: () => reportingApi.lateSubmissions(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseLanguageBreakdown(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseLanguages(courseId ?? ''),
    queryFn: () => reportingApi.languageBreakdown(courseId as string),
    enabled: !!courseId,
  });
}

export function useCourseRecentActivity(courseId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.courseActivity(courseId ?? ''),
    queryFn: () => reportingApi.recentActivity(courseId as string),
    enabled: !!courseId,
  });
}

export function useTenantDashboard(tenantId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.tenant(tenantId ?? ''),
    queryFn: () => reportingApi.tenantDashboard(tenantId as string),
    enabled: !!tenantId,
  });
}

export function useTenantIntegrationsHealth(tenantId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.tenantIntegrations(tenantId ?? ''),
    queryFn: () => reportingApi.tenantIntegrationsHealth(tenantId as string),
    enabled: !!tenantId,
  });
}

/** Whole-instance roll-up (all tenants). Backs the admin dashboard's
 *  default «Все организации» view. `enabled` so the page can switch
 *  between this and a single-tenant query. */
export function useInstanceOverview(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.instance(),
    queryFn: () => reportingApi.instanceOverview(),
    enabled,
  });
}

export function useInstanceIntegrationsHealth(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.instanceIntegrations(),
    queryFn: () => reportingApi.instanceIntegrationsHealth(),
    enabled,
  });
}

export function useGlobalDashboard() {
  return useQuery({
    queryKey: dashboardKeys.global(),
    queryFn: () => reportingApi.globalDashboard(),
  });
}
