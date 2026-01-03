/**
 * CoursesListPage — verifies list rendering for teachers (sees create button)
 * and students (sees join CTA when no courses).
 */
import { screen, waitFor } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, teacherUser, studentUser } from '../testHelpers';

vi.mock('@/api/endpoints/courses', () => ({
  coursesApi: {
    list: vi.fn(),
  },
}));

import { coursesApi } from '@/api/endpoints/courses';
import CoursesListPage from '@/pages/courses/CoursesListPage';

describe('CoursesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create button for teachers', async () => {
    (coursesApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'c_1',
          name: 'DS Course',
          slug: 'ds-2026',
          status: 'active',
        },
      ],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    });
    renderWithProviders(<CoursesListPage />, {
      user: teacherUser,
      initialEntries: ['/courses'],
      path: '/courses',
    });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /создать курс/i })).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(screen.getByText('DS Course')).toBeInTheDocument();
    });
  });

  it('shows join CTA for students with empty list', async () => {
    (coursesApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    });
    renderWithProviders(<CoursesListPage />, {
      user: studentUser,
      initialEntries: ['/courses'],
      path: '/courses',
    });
    await waitFor(() =>
      expect(screen.getByText(/Используйте код приглашения/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('link', { name: /создать курс/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /присоединиться по коду/i }),
    ).toBeInTheDocument();
  });
});
