/**
 * MyDashboardPage — uses /users/me/dashboard.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { renderWithProviders, studentUser } from '../../testHelpers';
import MyDashboardPage from '@/pages/dashboard/MyDashboardPage';

vi.mock('@/api/endpoints/reporting', () => ({
  reportingApi: {
    myDashboard: vi.fn().mockResolvedValue({
      upcoming_deadlines: [
        {
          assignment_id: 'a_1',
          assignment_title: 'Лаб 1',
          course_slug: 'algo',
          course_name: 'Алгоритмы',
          due_at: '2026-05-15T18:00:00Z',
        },
      ],
      recent_grades: [
        {
          submission_id: 's_9',
          assignment_id: 'a_2',
          assignment_title: 'Лаб 2',
          course_slug: 'algo',
          score: 9.5,
          graded_at: '2026-05-04T10:00:00Z',
        },
      ],
      my_courses: [
        {
          id: 'c_1',
          slug: 'algo',
          name: 'Алгоритмы',
          role: 'student',
          average_score: 8.4,
        },
      ],
      generated_at: '2026-05-07T00:00:00Z',
    }),
    myRecentActivity: vi.fn().mockResolvedValue([]),
    myProgress: vi.fn().mockResolvedValue({
      semester: '2025-spring',
      progress_percent: 50,
    }),
  },
}));

describe('MyDashboardPage', () => {
  it('renders title with user name', async () => {
    renderWithProviders(<MyDashboardPage />, { user: studentUser });
    expect(
      screen.getByRole('heading', { name: /Здравствуйте/i }),
    ).toBeInTheDocument();
  });

  it('renders my courses list', async () => {
    renderWithProviders(<MyDashboardPage />, { user: studentUser });
    await waitFor(() => {
      // Course name shows up at least in the courses table.
      expect(screen.getAllByText('Алгоритмы').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('my-courses-table')).toBeInTheDocument();
  });

  it('renders upcoming deadlines and recent grades', async () => {
    renderWithProviders(<MyDashboardPage />, { user: studentUser });
    await waitFor(() => {
      expect(screen.getByTestId('deadline-a_1')).toBeInTheDocument();
      expect(screen.getByTestId('grade-s_9')).toBeInTheDocument();
    });
  });
});
