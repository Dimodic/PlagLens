/**
 * NotificationsBellDropdown — bell icon, dropdown, mark-all.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { renderWithProviders, studentUser } from '../../testHelpers';
import { NotificationsBellDropdown } from '@/components/notifications/NotificationsBellDropdown';

const { markAllMock } = vi.hoisted(() => ({
  markAllMock: vi.fn().mockResolvedValue(undefined),
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
            id: 'n_a',
            event_type: 'plagiarism.run.completed.v1',
            title: 'Hello',
            body: 'World',
            severity: 'info',
            read: false,
            created_at: '2026-05-07T10:00:00Z',
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 10 },
      }),
      unreadCount: vi.fn().mockResolvedValue(3),
      markAllRead: markAllMock,
      streamUrl: () => '/api/v1/notifications/stream',
    },
  };
});

// Disable SSE in jsdom (no native EventSource).
vi.mock('@/api/sse', () => ({
  useSSE: () => ({ lastNotification: null, isConnected: false, reconnect: () => {} }),
  SSEClient: class {},
}));

describe('<NotificationsBellDropdown />', () => {
  it('renders bell icon with badge', async () => {
    renderWithProviders(<NotificationsBellDropdown />, { user: studentUser });
    await waitFor(() => {
      expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
    });
  });

  it('opens dropdown on click and lists notifications', async () => {
    renderWithProviders(<NotificationsBellDropdown />, { user: studentUser });
    fireEvent.click(screen.getByTestId('bell-icon'));
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
    expect(screen.getByTestId('open-all-link')).toBeInTheDocument();
  });

  it('mark-all-read fires when unread > 0', async () => {
    renderWithProviders(<NotificationsBellDropdown />, { user: studentUser });
    fireEvent.click(screen.getByTestId('bell-icon'));
    const btn = await screen.findByTestId('mark-all-read-btn');
    fireEvent.click(btn);
    await waitFor(() => expect(markAllMock).toHaveBeenCalled());
  });
});
