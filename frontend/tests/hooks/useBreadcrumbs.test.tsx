/**
 * useBreadcrumbs — verify the hook resolves the right chain for key routes.
 *
 * The hook reads route params via `useParams` + `useLocation`, so we wrap the
 * renderHook call in a MemoryRouter pinned to the URL we want to test, plus a
 * <Routes> tree that mirrors `routes/index.tsx` (so `useParams()` returns the
 * right keys). API hooks are mocked at the module level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';

// --- Mock API endpoints (the hooks resolve via React Query) ---
vi.mock('@/api/endpoints/courses', () => ({
  coursesApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('@/api/endpoints/homeworks', () => ({
  homeworksApi: {
    listForCourse: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('@/api/endpoints/assignments', () => ({
  assignmentsApi: {
    get: vi.fn(),
  },
}));
vi.mock('@/api/endpoints/users', () => ({
  usersApi: {
    get: vi.fn(),
    patchMe: vi.fn(),
  },
}));

import { coursesApi } from '@/api/endpoints/courses';
import { homeworksApi } from '@/api/endpoints/homeworks';
import { assignmentsApi } from '@/api/endpoints/assignments';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

function makeWrapper(initialPath: string, routePattern: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
    });
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path={routePattern} element={<>{children}</>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useBreadcrumbs', () => {
  beforeEach(() => {
    // Reset both call history AND queued mock implementations between tests.
    vi.resetAllMocks();
  });

  it('returns [] for /me (sidebar entry-point — fallback to title)', () => {
    const { result } = renderHook(() => useBreadcrumbs(), {
      wrapper: makeWrapper('/me', '/me'),
    });
    expect(result.current).toEqual([]);
  });

  it('returns 3 crumbs for /courses/:slug/homeworks/:hwSlug', async () => {
    (coursesApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{ id: 'c_1', name: 'Алгоритмы и СД', slug: 'algos', status: 'active' }],
      pagination: { next_cursor: null, has_more: false, limit: 25 },
    });
    (coursesApi.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'c_1',
      name: 'Алгоритмы и СД',
      slug: 'algos',
      status: 'active',
      description: '',
      settings: {},
    });
    (homeworksApi.listForCourse as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        {
          id: 'h_1',
          course_id: 'c_1',
          slug: 'week-1',
          title: 'Week 1',
          description: null,
          position: 1,
          status: 'published',
          due_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: null,
        },
      ],
      pagination: { next_cursor: null, has_more: false, limit: 100 },
    });

    const { result } = renderHook(() => useBreadcrumbs(), {
      wrapper: makeWrapper(
        '/courses/algos/homeworks/week-1',
        '/courses/:slug/homeworks/:hwSlug',
      ),
    });

    // Wait until both queries (course + homeworks) resolve.
    await waitFor(() => {
      expect(result.current).toHaveLength(3);
      expect(result.current[1].label).toBe('Алгоритмы и СД');
      expect(result.current[2].label).toBe('Week 1');
    });

    expect(result.current[0]).toMatchObject({
      to: '/courses',
    });
    expect(result.current[0].current).toBeFalsy();
    expect(result.current[1]).toMatchObject({
      to: '/courses/algos',
      label: 'Алгоритмы и СД',
    });
    expect(result.current[2]).toMatchObject({
      label: 'Week 1',
      current: true,
    });
    expect(result.current[2].to).toBeUndefined();
  });

  it('returns 4 crumbs for /courses/:slug/homeworks/:hwSlug/assignments/new', async () => {
    (coursesApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{ id: 'c_1', name: 'Алгоритмы', slug: 'algos', status: 'active' }],
      pagination: { next_cursor: null, has_more: false, limit: 25 },
    });
    (coursesApi.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'c_1',
      name: 'Алгоритмы',
      slug: 'algos',
      status: 'active',
      description: '',
      settings: {},
    });
    (homeworksApi.listForCourse as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        {
          id: 'h_1',
          course_id: 'c_1',
          slug: 'week-1',
          title: 'Week 1',
          description: null,
          position: 1,
          status: 'published',
          due_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: null,
        },
      ],
      pagination: { next_cursor: null, has_more: false, limit: 100 },
    });

    const { result } = renderHook(() => useBreadcrumbs(), {
      wrapper: makeWrapper(
        '/courses/algos/homeworks/week-1/assignments/new',
        '/courses/:slug/homeworks/:hwSlug/assignments/new',
      ),
    });

    await waitFor(() => {
      expect(result.current).toHaveLength(4);
      // Wait for HW data to resolve — until then label falls back to slug.
      expect(result.current[2].label).toBe('Week 1');
    });
    expect(result.current[3].current).toBe(true);
    expect(result.current[2]).toMatchObject({
      to: '/courses/algos/homeworks/week-1',
      label: 'Week 1',
    });
  });

  it('returns 2 crumbs for legacy /assignments/:id without homework_id', async () => {
    (assignmentsApi.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'a_1',
      course_id: '42',
      slug: 'mergesort',
      title: 'MergeSort',
      status: 'published',
      description: '',
      late_score_multiplier: 1,
      selection_strategy: 'last',
      plagiarism_auto_run: false,
      plagiarism_threshold: 0,
      ai_auto_run: false,
      ai_prompt_version: null,
      external_bindings: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      // Note: no homework_id → no HW crumb.
      homework_id: null,
    });
    // useCourse('42') treats numeric ids as direct fetch (skips list).
    (coursesApi.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: '42',
      name: 'Алгоритмы',
      slug: 'algos',
      status: 'active',
      description: '',
      settings: {},
    });

    const { result } = renderHook(() => useBreadcrumbs(), {
      wrapper: makeWrapper('/assignments/a_1', '/assignments/:id'),
    });

    await waitFor(() => {
      // [Курсы, Course, Assignment] — no homework crumb because homework_id is null.
      expect(result.current).toHaveLength(3);
      expect(result.current[2].label).toBe('MergeSort');
      expect(result.current[2].current).toBe(true);
    });
  });
});
