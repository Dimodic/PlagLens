/**
 * PreferencesPage — channels toggle, digest select, matrix.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { renderWithProviders, studentUser } from '../../testHelpers';
import PreferencesPage from '@/pages/notifications/PreferencesPage';

vi.mock('@/api/endpoints/notifications', async (orig) => {
  const actual = await orig<typeof import('@/api/endpoints/notifications')>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      getPreferences: vi.fn().mockResolvedValue({
        channels_enabled: { inapp: true, email: true, telegram: false },
        email_digest_frequency: 'instant',
        quiet_hours_start: null,
        quiet_hours_end: null,
        timezone: 'Europe/Moscow',
      }),
      getPerEvent: vi.fn().mockResolvedValue({
        'submission.grade.assigned.v1': {
          inapp: true,
          email: true,
          telegram: false,
        },
      }),
      availableEvents: vi.fn().mockResolvedValue([
        {
          event_type: 'submission.grade.assigned.v1',
          title: 'Оценка выставлена',
          description: 'Когда вам выставили оценку.',
          default_severity: 'info',
        },
      ]),
      updatePreferences: vi.fn(),
      updatePerEvent: vi.fn(),
      resetPreferences: vi.fn(),
      testNotification: vi.fn().mockResolvedValue({ delivered: true }),
    },
  };
});

describe('PreferencesPage', () => {
  it('renders channel switches', async () => {
    renderWithProviders(<PreferencesPage />, { user: studentUser });
    await waitFor(() => {
      expect(screen.getByTestId('ch-inapp')).toBeInTheDocument();
      expect(screen.getByTestId('ch-email')).toBeInTheDocument();
      expect(screen.getByTestId('ch-telegram')).toBeInTheDocument();
    });
  });

  it('renders digest select and save button', async () => {
    renderWithProviders(<PreferencesPage />, { user: studentUser });
    await waitFor(() => {
      expect(screen.getByTestId('digest-select')).toBeInTheDocument();
      expect(screen.getByTestId('save-btn')).toBeInTheDocument();
    });
  });

  it('renders preferences matrix when events load', async () => {
    renderWithProviders(<PreferencesPage />, { user: studentUser });
    await waitFor(() => {
      expect(screen.getByTestId('preferences-matrix')).toBeInTheDocument();
      expect(
        screen.getByTestId('pref-row-submission.grade.assigned.v1'),
      ).toBeInTheDocument();
    });
  });
});
