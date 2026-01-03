/**
 * CourseExportsPage — uses /courses/:slug/exports.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { renderWithProviders, teacherUser } from '../../testHelpers';
import CourseExportsPage from '@/pages/reporting/CourseExportsPage';

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
    listCourseExports: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'exp_a',
          kind: 'assignment_grades',
          scope: { course_id: 'c_1' },
          format: 'csv',
          status: 'queued',
          artifact_size_bytes: null,
          created_at: '2026-05-07T00:00:00Z',
        },
      ],
      pagination: { has_more: false, next_cursor: null, limit: 50 },
    }),
    startCourseExport: vi.fn(),
    downloadExport: vi.fn(),
    retryExport: vi.fn(),
    cancelExport: vi.fn(),
    deleteExport: vi.fn(),
  },
}));

describe('CourseExportsPage', () => {
  it('renders course exports table', async () => {
    renderWithProviders(<CourseExportsPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/exports'],
      path: '/courses/:slug/exports',
    });
    await waitFor(() => {
      expect(screen.getByTestId('course-exports-table')).toBeInTheDocument();
      expect(screen.getByTestId('export-row-exp_a')).toBeInTheDocument();
    });
  });

  it('shows cancel button for queued export', async () => {
    renderWithProviders(<CourseExportsPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/exports'],
      path: '/courses/:slug/exports',
    });
    await waitFor(() => {
      expect(screen.getByTestId('cancel-exp_a')).toBeInTheDocument();
    });
  });
});
