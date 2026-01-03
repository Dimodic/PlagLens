/**
 * Tests for UsersListPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/users', () => {
  return {
    usersApi: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'usr_1',
            email: 'alice@hse.ru',
            display_name: 'Alice',
            avatar_url: null,
            global_role: 'student',
            tenant_id: 't1',
            status: 'active',
            locale: 'ru',
            timezone: null,
            created_at: '2026-01-01T00:00:00Z',
            last_login_at: '2026-04-30T12:00:00Z',
            email_verified_at: '2026-01-02T00:00:00Z',
            anonymized_at: null,
          },
          {
            id: 'usr_2',
            email: 'bob@hse.ru',
            display_name: 'Bob',
            avatar_url: null,
            global_role: 'teacher',
            tenant_id: 't1',
            status: 'disabled',
            locale: 'ru',
            timezone: null,
            created_at: '2026-02-01T00:00:00Z',
            last_login_at: null,
            email_verified_at: null,
            anonymized_at: null,
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 100 },
      }),
      disable: vi.fn(),
      enable: vi.fn(),
      anonymize: vi.fn(),
      resetPassword: vi.fn(),
      forceLogout: vi.fn(),
    },
  };
});

import { UsersListPage } from '@/pages/admin/UsersListPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/users']}>
          <UsersListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('UsersListPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the page title', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Пользователи' })).toBeInTheDocument();
    });
  });

  it('renders user rows with names and roles', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
    expect(screen.getByText('alice@hse.ru')).toBeInTheDocument();
    // Role appears in user row badges (and also the Select filter options).
    expect(screen.getAllByText('student').length).toBeGreaterThan(0);
    expect(screen.getAllByText('teacher').length).toBeGreaterThan(0);
  });

  it('renders status badges per user', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getAllByText('active').length).toBeGreaterThan(0);
      expect(screen.getAllByText('disabled').length).toBeGreaterThan(0);
    });
  });

  it('updates filter input', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    const input = screen.getByTestId('users-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alice' } });
    expect(input.value).toBe('alice');
  });
});
