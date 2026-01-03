/**
 * CourseDetailPage — verifies that header + assignments tab render with
 * mock course + assignments.
 */
import { screen, waitFor } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, teacherUser } from '../testHelpers';

vi.mock('@/api/endpoints/courses', () => ({
  coursesApi: {
    get: vi.fn(),
    archive: vi.fn(),
    duplicate: vi.fn(),
  },
}));

vi.mock('@/api/endpoints/assignments', () => ({
  assignmentsApi: {
    listInCourse: vi.fn(),
  },
}));

import { coursesApi } from '@/api/endpoints/courses';
import { assignmentsApi } from '@/api/endpoints/assignments';
import CourseDetailPage from '@/pages/courses/CourseDetailPage';

const fakeCourse = {
  id: 'c_1',
  name: 'Анализ данных',
  slug: 'ds-2026',
  status: 'active',
  description: 'Курс по DS',
  start_date: '2026-02-01',
  end_date: '2026-06-30',
  members_count: 42,
  settings: {},
};

const fakeAssignments = {
  data: [
    {
      id: 'a_1',
      course_id: 'c_1',
      slug: 'lab-1',
      title: 'Лаба 1: сортировка',
      status: 'published',
      language_hint: 'python',
      max_score: 10,
      deadline_soft_at: null,
      deadline_hard_at: null,
    },
  ],
  pagination: { next_cursor: null, has_more: false, limit: 30 },
};

describe('CourseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (coursesApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCourse);
    (assignmentsApi.listInCourse as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeAssignments,
    );
  });

  it('renders course meta and tabs', async () => {
    renderWithProviders(<CourseDetailPage />, {
      user: { ...teacherUser, course_roles: { c_1: 'owner' } },
      initialEntries: ['/courses/ds-2026'],
      path: '/courses/:slug',
    });

    await waitFor(() =>
      expect(screen.getByText('Анализ данных')).toBeInTheDocument(),
    );
    expect(screen.getByText('ds-2026')).toBeInTheDocument();
    // tabs
    expect(screen.getByRole('tab', { name: /Задания/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Участники/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Группы/ })).toBeInTheDocument();
    // assignment from list
    await waitFor(() =>
      expect(screen.getByText('Лаба 1: сортировка')).toBeInTheDocument(),
    );
  });
});
