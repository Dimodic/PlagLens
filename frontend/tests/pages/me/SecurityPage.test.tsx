/**
 * Tests for SecurityPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';
import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';

vi.mock('@/api/endpoints/users', () => {
  return {
    usersApi: {
      changePassword: vi.fn(),
      enroll2fa: vi.fn(),
      enable2fa: vi.fn(),
      disable2fa: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([
        {
          id: 'sess_1',
          ip: '10.0.0.1',
          user_agent: 'Chrome / Mac',
          created_at: '2026-04-01T00:00:00Z',
          last_used_at: '2026-05-01T00:00:00Z',
          expires_at: '2026-06-01T00:00:00Z',
          current: true,
        },
        {
          id: 'sess_2',
          ip: '10.0.0.2',
          user_agent: 'Firefox',
          created_at: '2026-03-01T00:00:00Z',
          last_used_at: '2026-04-29T00:00:00Z',
          expires_at: '2026-05-31T00:00:00Z',
          current: false,
        },
      ]),
      revokeSession: vi.fn(),
      unlinkOAuth: vi.fn(),
    },
  };
});

import { SecurityPage } from '@/pages/me/SecurityPage';

function authContext(): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'usr_1',
      email: 'me@plaglens.test',
      display_name: 'Me',
      avatar_url: null,
      locale: 'ru',
      timezone: null,
      global_role: 'student',
      course_roles: {},
      tenant: { id: 't1', slug: 'demo', name: 'Demo' },
      email_verified: true,
      two_factor_enabled: false,
      linked_oauth: ['google'],
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
            <SecurityPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('SecurityPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading and tabs', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Безопасность' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Password' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2FA' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'OAuth' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument();
  });

  it('renders password change form by default', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByLabelText('Текущий пароль')).toBeInTheDocument();
      expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument();
    });
  });
});
