/**
 * NotificationCenterPage — tabs, list rendering, mark all.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders, studentUser } from '../../testHelpers';
import NotificationCenterPage from '@/pages/notifications/NotificationCenterPage';

const { markAllReadMock } = vi.hoisted(() => ({
  markAllReadMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/endpoints/notifications', async (orig) => {
  const actual = await orig<typeof import('@/api/endpoints/notifications')>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'n_1',
            event_type: 'plagiarism.run.completed.v1',
            title: 'Плагиат',
            body: 'Подозрительная пара',
            severity: 'warning',
            read: false,
            created_at: '2026-05-07T10:00:00Z',
            action_url: '/plagiarism-runs/r1',
          },
          {
            id: 'n_2',
            event_type: 'submission.grade.assigned.v1',
            title: 'Оценка',
            body: 'Выставлена оценка',
            severity: 'info',
            read: false,
            created_at: '2026-05-07T11:00:00Z',
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 50 },
      }),
      unreadCount: vi.fn().mockResolvedValue(2),
      markRead: vi.fn().mockResolvedValue(undefined),
      markAllRead: markAllReadMock,
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('NotificationCenterPage', () => {
  it('renders title and tabs', async () => {
    renderWithProviders(<NotificationCenterPage />, { user: studentUser });
    expect(
      screen.getByRole('heading', { name: /Уведомления/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Непрочитанные')).toBeInTheDocument();
    expect(screen.getByText('Все')).toBeInTheDocument();
    expect(screen.getByText('Архив')).toBeInTheDocument();
  });

  it('renders notification rows', async () => {
    renderWithProviders(<NotificationCenterPage />, { user: studentUser });
    await waitFor(() => {
      expect(screen.getByTestId('notification-n_1')).toBeInTheDocument();
      expect(screen.getByTestId('notification-n_2')).toBeInTheDocument();
    });
  });

  it('mark-all-read button calls markAllRead', async () => {
    renderWithProviders(<NotificationCenterPage />, { user: studentUser });
    const btn = await screen.findByTestId('mark-all-btn');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(markAllReadMock).toHaveBeenCalled();
    });
  });
});
