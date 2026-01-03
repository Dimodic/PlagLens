/**
 * Tests for ProfilePage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';
import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';

vi.mock('@/api/endpoints/users', () => {
  return {
    usersApi: {
      patchMe: vi.fn().mockResolvedValue({
        id: 'usr_1',
        email: 'me@plaglens.test',
        display_name: 'Updated',
        avatar_url: null,
        locale: 'en',
        timezone: 'Europe/Moscow',
        global_role: 'student',
        course_roles: {},
        tenant: { id: 't1', slug: 'demo', name: 'Demo' },
        email_verified: true,
        two_factor_enabled: false,
        linked_oauth: [],
        last_login_at: null,
      }),
      uploadAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
    },
  };
});

import { usersApi } from '@/api/endpoints/users';

import { ProfilePage } from '@/pages/me/ProfilePage';

function authContext(): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'usr_1',
      email: 'me@plaglens.test',
      display_name: 'Initial',
      avatar_url: null,
      locale: 'ru',
      timezone: null,
      global_role: 'student',
      course_roles: {},
      tenant: { id: 't1', slug: 'demo', name: 'Demo' },
      email_verified: true,
      two_factor_enabled: false,
      linked_oauth: [],
      last_login_at: null,
    },
    accessToken: 'tok',
    login: async () => ({ requiresMfa: false }),
    register: async () => undefined,
    logout: async () => undefined,
    refresh: async () => true,
    reloadMe: async () => undefined,
  };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={authContext()}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders profile heading', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
  });

  it('prefills display name and email', async () => {
    setup();
    await waitFor(() => {
      const display = screen.getByLabelText('Display name') as HTMLInputElement;
      expect(display.value).toBe('Initial');
    });
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('me@plaglens.test');
  });

  it('saves changes when Сохранить is clicked', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    });
    const display = screen.getByLabelText('Display name') as HTMLInputElement;
    fireEvent.change(display, { target: { value: 'Updated' } });

    const btn = screen.getByRole('button', { name: 'Сохранить' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(usersApi.patchMe).toHaveBeenCalled();
    });
  });
});
