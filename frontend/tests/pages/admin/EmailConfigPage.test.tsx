/**
 * Tests for EmailConfigPage.
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

vi.mock('@/api/endpoints/notificationsAdmin', () => {
  return {
    notificationsAdminApi: {
      getEmailConfig: vi.fn().mockResolvedValue({
        transport: 'smtp',
        from_email: 'noreply@plaglens.test',
        from_name: 'PlagLens',
        smtp_host: 'smtp.plaglens.test',
        smtp_port: 587,
        smtp_username: 'noreply',
        smtp_use_tls: true,
      }),
      updateEmailConfig: vi.fn().mockResolvedValue({
        transport: 'smtp',
        from_email: 'noreply@plaglens.test',
        from_name: 'PlagLens',
      }),
      testEmail: vi.fn(),
      dnsStatus: vi
        .fn()
        .mockResolvedValue({
          domain: 'plaglens.test',
          spf_ok: true,
          dkim_ok: true,
          dmarc_ok: false,
        }),
    },
  };
});

import { EmailConfigPage } from '@/pages/admin/EmailConfigPage';

function adminAuthContext(): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'usr_admin',
      email: 'admin@plaglens.test',
      display_name: 'Admin',
      avatar_url: null,
      locale: 'ru',
      timezone: null,
      global_role: 'admin',
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
        <AuthContext.Provider value={adminAuthContext()}>
          <MemoryRouter initialEntries={['/admin/notifications/email']}>
            <EmailConfigPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('EmailConfigPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading', async () => {
    setup();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Email-конфиг' }),
      ).toBeInTheDocument();
    });
  });

  it('renders SMTP fields after loading', async () => {
    setup();
    await waitFor(() => {
      // Look for from_email value (input pre-filled)
      const inputs = document.querySelectorAll('input');
      const fromEmail = Array.from(inputs).find(
        (el) => (el as HTMLInputElement).value === 'noreply@plaglens.test',
      );
      expect(fromEmail).toBeDefined();
    });
    expect(screen.getByText('from_email')).toBeInTheDocument();
    expect(screen.getByText('smtp_host')).toBeInTheDocument();
  });

  it('renders test button', async () => {
    setup();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Тест на свой email/i }),
      ).toBeInTheDocument();
    });
  });
});
