/**
 * LoginPage tests:
 *  - submitting calls authApi.login
 *  - on TWO_FACTOR_REQUIRED → TOTP field appears
 */
import { render } from '@testing-library/react';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import LoginPage from '@/pages/auth/LoginPage';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/auth', () => {
  const refresh = vi.fn().mockRejectedValue({
    code: 'UNAUTHENTICATED',
    title: 'no',
    status: 401,
  });
  const me = vi.fn();
  const login = vi.fn();
  const logout = vi.fn(async () => undefined);
  const twoFactorVerify = vi.fn();
  return {
    authApi: { refresh, me, login, logout, twoFactorVerify },
  };
});

import { authApi } from '@/api/endpoints/auth';

const fakeUser = {
  id: 'usr_1',
  email: 'a@b.c',
  display_name: 'A',
  avatar_url: null,
  locale: 'ru',
  timezone: null,
  global_role: 'student' as const,
  course_roles: {},
  tenant: { id: 't', slug: 's', name: 'n' },
  email_verified: true,
  two_factor_enabled: false,
  linked_oauth: [],
  last_login_at: null,
};

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<div>HOME</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email + password fields and OAuth buttons', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Пароль/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /github/i })).toBeInTheDocument();
  });

  it('calls authApi.login on submit', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      access_token: 'tk',
      expires_in: 900,
      user: fakeUser,
    });
    (authApi.me as ReturnType<typeof vi.fn>).mockResolvedValue(fakeUser);

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.change(screen.getByLabelText(/Пароль/i), {
      target: { value: 'pw1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.c', password: 'pw1234' }),
      );
    });
  });

  it('shows TOTP field on TWO_FACTOR_REQUIRED', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 'TWO_FACTOR_REQUIRED',
      title: 'mfa',
      status: 401,
      mfa_token: 'mfa-1',
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.change(screen.getByLabelText(/Пароль/i), {
      target: { value: 'pw1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Код 2FA/i)).toBeInTheDocument();
    });
  });
});
