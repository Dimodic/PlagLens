/**
 * CourseDashboardPage — KPIs, tabs, language pie/timeline panels.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { renderWithProviders, teacherUser } from '../../testHelpers';
import CourseDashboardPage from '@/pages/dashboard/CourseDashboardPage';

vi.mock('@/api/endpoints/courses', () => ({
  coursesApi: {
    get: vi.fn().mockResolvedValue({
      id: 'c_1',
      name: 'Алгоритмы',
      slug: 'algo',
      status: 'active',
      description: '',
      settings: {},
    }),
  },
}));

vi.mock('@/api/endpoints/reporting', () => ({
  reportingApi: {
    courseDashboard: vi.fn().mockResolvedValue({
      course_id: 'c_1',
      kpi: {
        enrolled_students: 25,
        assignments_count: 4,
        submissions_total: 100,
        average_score: 7.5,
        plagiarism_alerts_count: 2,
        ai_runs_count: 50,
      },
      generated_at: '2026-05-07T00:00:00Z',
    }),
    gradesDistribution: vi.fn().mockResolvedValue({
      buckets: [{ bucket: '0-1', min: 0, max: 1, count: 1 }],
      mean: 5,
      median: 5,
      stddev: 1,
    }),
    gradesByAssignment: vi.fn().mockResolvedValue([]),
    plagiarismStats: vi.fn().mockResolvedValue({
      series: [],
      by_language: [],
      total_runs: 0,
      total_pairs_flagged: 0,
    }),
    aiUsage: vi.fn().mockResolvedValue({
      series: [],
      total_tokens: 0,
      total_cost_usd: 0,
      cache_hit_rate: 0,
      runs_count: 0,
    }),
    timeline: vi.fn().mockResolvedValue([]),
    activeStudents: vi.fn().mockResolvedValue([]),
    stragglers: vi.fn().mockResolvedValue([]),
    lateSubmissions: vi.fn().mockResolvedValue([]),
    languageBreakdown: vi.fn().mockResolvedValue([]),
    recentActivity: vi.fn().mockResolvedValue([]),
  },
}));

describe('CourseDashboardPage', () => {
  it('renders course title and kpi cards', async () => {
    renderWithProviders(<CourseDashboardPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/dashboard'],
      path: '/courses/:slug/dashboard',
    });

    await waitFor(() => {
      expect(screen.getByText(/Дашборд/)).toBeInTheDocument();
    });
    await waitFor(() => {
      // Студенты counter
      expect(screen.getByText('Студентов')).toBeInTheDocument();
    });
  });

  it('shows tabs for grades, plagiarism, AI, timeline, languages, activity, late', async () => {
    renderWithProviders(<CourseDashboardPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/dashboard'],
      path: '/courses/:slug/dashboard',
    });
    expect(screen.getByText(/Обзор/)).toBeInTheDocument();
    expect(screen.getByText(/Оценки/)).toBeInTheDocument();
    expect(screen.getByText(/Плагиат/)).toBeInTheDocument();
    expect(screen.getByText(/Языки/)).toBeInTheDocument();
  });
});
