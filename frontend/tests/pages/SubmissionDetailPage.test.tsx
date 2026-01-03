/**
 * SubmissionDetailPage — verifies tabs render and grade form appears
 * for teachers but not for students.
 */
import { screen, waitFor } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, studentUser, teacherUser } from '../testHelpers';

vi.mock('@/api/endpoints/submissions', () => ({
  submissionsApi: {
    get: vi.fn(),
    listFiles: vi.fn(),
    getFileContent: vi.fn(),
    listFeedback: vi.fn(),
    listFlags: vi.fn(),
    history: vi.fn(),
    getGrade: vi.fn(),
  },
}));

vi.mock('@/api/endpoints/assignments', () => ({
  assignmentsApi: {
    get: vi.fn(),
  },
}));

import { submissionsApi } from '@/api/endpoints/submissions';
import { assignmentsApi } from '@/api/endpoints/assignments';
import SubmissionDetailPage from '@/pages/submissions/SubmissionDetailPage';

const fakeSubmission = {
  id: 's_1',
  assignment_id: 'a_1',
  course_id: 'c_1',
  author_id: 'usr_42',
  author: {
    id: 'usr_42',
    email: 's@x.y',
    display_name: 'Stud',
    avatar_url: null,
    global_role: 'student',
    tenant_id: 't_1',
  },
  version: 1,
  source: 'manual',
  language: 'python',
  status: 'ready',
  flags: { suspicious: false },
  is_late: false,
  late_kind: null,
  total_size_bytes: 1024,
  submitted_at: '2026-04-15T12:00:00Z',
  imported_at: null,
  selected_for_grading: false,
  content_hash: 'abc',
};

describe('SubmissionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (submissionsApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeSubmission,
    );
    (submissionsApi.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'f_1',
          submission_id: 's_1',
          path: 'main.py',
          size_bytes: 100,
          mime_type: 'text/x-python',
          content_hash: 'h',
        },
      ],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    });
    (
      submissionsApi.getFileContent as ReturnType<typeof vi.fn>
    ).mockResolvedValue('print(1)\n');
    (submissionsApi.listFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    });
    (submissionsApi.listFlags as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    });
    (submissionsApi.history as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    });
    (submissionsApi.getGrade as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: 'NOT_FOUND',
      title: 'no grade',
      status: 404,
    });
    (assignmentsApi.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a_1',
      course_id: 'c_1',
      slug: 'lab',
      title: 'Lab',
      description: 'do',
      status: 'published',
      language_hint: 'python',
      max_score: 10,
      weight: 1,
      late_score_multiplier: 0.5,
      selection_strategy: 'best',
      plagiarism_auto_run: false,
      plagiarism_threshold: 0.6,
      ai_auto_run: false,
      ai_prompt_version: null,
      external_bindings: [],
      created_at: '',
      updated_at: '',
    });
  });

  it('shows base tabs and file tree', async () => {
    renderWithProviders(<SubmissionDetailPage />, {
      user: studentUser,
      initialEntries: ['/submissions/s_1'],
      path: '/submissions/:id',
    });
    await waitFor(() => {
      expect(screen.getByText(/Посылка/)).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /Файлы/ })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Комментарии/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /История/ }),
    ).toBeInTheDocument();
    // student should NOT see grade tab
    expect(screen.queryByRole('tab', { name: /Оценка/ })).not.toBeInTheDocument();
  });

  it('shows grade tab for teachers', async () => {
    renderWithProviders(<SubmissionDetailPage />, {
      user: { ...teacherUser, course_roles: { c_1: 'owner' } },
      initialEntries: ['/submissions/s_1'],
      path: '/submissions/:id',
    });
    await waitFor(() =>
      expect(screen.getByText(/Посылка/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: /Оценка/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Флаги/ })).toBeInTheDocument();
  });
});
