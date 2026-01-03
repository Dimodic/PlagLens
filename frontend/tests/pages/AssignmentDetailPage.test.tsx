/**
 * AssignmentDetailPage — verifies student vs. teacher view differences.
 */
import { screen, waitFor } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, studentUser, teacherUser } from '../testHelpers';

vi.mock('@/api/endpoints/assignments', () => ({
  assignmentsApi: {
    get: vi.fn(),
    getStats: vi.fn(),
  },
}));
vi.mock('@/api/endpoints/submissions', () => ({
  submissionsApi: {
    listForAssignment: vi.fn(),
  },
}));

import { assignmentsApi } from '@/api/endpoints/assignments';
import { submissionsApi } from '@/api/endpoints/submissions';
import AssignmentDetailPage from '@/pages/assignments/AssignmentDetailPage';

const fakeAssignment = {
  id: 'a_1',
  course_id: 'c_1',
  slug: 'lab-1',
  title: 'Лаба 1',
  description: 'Сделайте сортировку.',
  status: 'published',
  language_hint: 'python',
  max_score: 10,
  weight: 1,
  late_score_multiplier: 0.5,
  selection_strategy: 'best',
  plagiarism_auto_run: true,
  plagiarism_threshold: 0.6,
  ai_auto_run: false,
  ai_prompt_version: null,
  external_bindings: [],
  deadline_soft_at: null,
  deadline_hard_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

describe('AssignmentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (assignmentsApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeAssignment,
    );
    (assignmentsApi.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      submissions_count: 5,
      students_submitted: 3,
      average_score: 7.5,
      plagiarism_alerts: 1,
      ai_runs: 2,
    });
    (
      submissionsApi.listForAssignment as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false, limit: 25 },
    });
  });

  it('shows upload button for students', async () => {
    renderWithProviders(<AssignmentDetailPage />, {
      user: studentUser,
      initialEntries: ['/assignments/a_1'],
      path: '/assignments/:id',
    });
    await waitFor(() =>
      expect(screen.getByText('Лаба 1')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /Загрузить посылку/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Настройки/i }),
    ).not.toBeInTheDocument();
  });

  it('shows teacher-specific tabs for teachers', async () => {
    renderWithProviders(<AssignmentDetailPage />, {
      user: { ...teacherUser, course_roles: { c_1: 'owner' } },
      initialEntries: ['/assignments/a_1'],
      path: '/assignments/:id',
    });
    await waitFor(() =>
      expect(screen.getByText('Лаба 1')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /Настройки/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Посылки/ })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Статистика/ }),
    ).toBeInTheDocument();
  });
});
