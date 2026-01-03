/**
 * ScheduledExportsPage — list of cron schedules + create modal.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders, teacherUser } from '../../testHelpers';
import ScheduledExportsPage from '@/pages/reporting/ScheduledExportsPage';

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
    listScheduled: vi.fn().mockResolvedValue([
      {
        id: 'sch_1',
        course_id: 'c_1',
        kind: 'course_summary',
        format: 'xlsx',
        target: 'file_download',
        cron: '0 9 * * *',
        enabled: true,
        last_run_at: '2026-05-06T09:00:00Z',
        next_run_at: '2026-05-08T09:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
      },
    ]),
    createScheduled: vi.fn(),
    deleteScheduled: vi.fn(),
    runScheduledNow: vi.fn(),
  },
}));

describe('ScheduledExportsPage', () => {
  it('renders schedule rows', async () => {
    renderWithProviders(<ScheduledExportsPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/scheduled-exports'],
      path: '/courses/:slug/scheduled-exports',
    });
    await waitFor(() => {
      expect(screen.getByTestId('scheduled-table')).toBeInTheDocument();
      expect(screen.getByTestId('schedule-row-sch_1')).toBeInTheDocument();
    });
    expect(screen.getByText('0 9 * * *')).toBeInTheDocument();
  });

  it('has Run-now and Delete buttons', async () => {
    renderWithProviders(<ScheduledExportsPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/scheduled-exports'],
      path: '/courses/:slug/scheduled-exports',
    });
    await waitFor(() => {
      expect(screen.getByTestId('run-now-sch_1')).toBeInTheDocument();
      expect(screen.getByTestId('delete-schedule-sch_1')).toBeInTheDocument();
    });
  });

  it('opens create modal', async () => {
    renderWithProviders(<ScheduledExportsPage />, {
      user: teacherUser,
      initialEntries: ['/courses/algo/scheduled-exports'],
      path: '/courses/:slug/scheduled-exports',
    });
    // Wait for the course (and table) to load before pressing the button —
    // otherwise it is disabled while course is still loading.
    await screen.findByTestId('schedule-row-sch_1');
    const btn = screen.getByRole('button', { name: /Новое расписание/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(
      () => {
        expect(screen.getByText(/Cron-выражение/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
