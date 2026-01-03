/**
 * useCourses hooks — verify cache integration via React Query +
 * MockAdapter on a test client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

vi.mock('@/api/endpoints/courses', () => ({
  coursesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
  },
}));

import { coursesApi } from '@/api/endpoints/courses';
import {
  useCourse,
  useCourses,
  useCreateCourse,
} from '@/hooks/api/useCourses';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCourses hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useCourses fetches a paginated list', async () => {
    const page = {
      data: [{ id: 'c_1', name: 'A', slug: 'a', status: 'active' }],
      pagination: { next_cursor: null, has_more: false, limit: 50 },
    };
    (coursesApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce(page);
    const { result } = renderHook(() => useCourses({ limit: 50 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(page);
    expect(coursesApi.list).toHaveBeenCalledWith({ limit: 50 });
  });

  it('useCourse skips when id is undefined', async () => {
    const { result } = renderHook(() => useCourse(undefined), { wrapper });
    // Disabled query — fetchStatus stays "idle"
    expect(result.current.isLoading).toBe(false);
    expect(coursesApi.get).not.toHaveBeenCalled();
  });

  it('useCreateCourse calls api.create and resolves', async () => {
    const created = {
      id: 'c_x',
      name: 'X',
      slug: 'x',
      status: 'active',
      description: '',
      settings: {},
    };
    (coursesApi.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      created,
    );
    const { result } = renderHook(() => useCreateCourse(), { wrapper });
    const out = await result.current.mutateAsync({
      slug: 'x',
      name: 'X',
    });
    expect(out).toEqual(created);
    expect(coursesApi.create).toHaveBeenCalledWith({ slug: 'x', name: 'X' });
  });
});
