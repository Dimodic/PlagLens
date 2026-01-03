/**
 * AuthProvider tests:
 *  - bootstrap calls /auth/refresh and then /auth/me
 *  - login() succeeds and sets user
 *  - login() detects MFA_REQUIRED and returns requiresMfa
 *  - logout() clears user
 */
import { act, render } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { useAuth } from '@/auth/useAuth';

// Mock the auth API surface
vi.mock('@/api/endpoints/auth', () => {
  const refresh = vi.fn();
  const me = vi.fn();
  const login = vi.fn();
  const logout = vi.fn(async () => undefined);
  return {
    authApi: { refresh, me, login, logout },
  };
});

import { authApi } from '@/api/endpoints/auth';

interface ProbeProps {
  onAuth?: (auth: ReturnType<typeof useAuth>) => void;
}
function Probe({ onAuth }: ProbeProps) {
  const auth = useAuth();
  useEffect(() => {
    onAuth?.(auth);
  });
  return (
    <div data-testid="status">
      {auth.status}:{auth.user?.email ?? 'no-user'}
    </div>
  );
}

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

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('bootstraps via /auth/refresh + /auth/me', async () => {
    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: 'tk',
      expires_in: 900,
    });
    (authApi.me as ReturnType<typeof vi.fn>).mockResolvedValue(fakeUser);

    const { getByTestId } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(getByTestId('status').textContent).toBe('authenticated:a@b.c'),
    );
    expect(authApi.refresh).toHaveBeenCalledOnce();
    expect(authApi.me).toHaveBeenCalled();
  });

  it('falls back to anonymous when refresh fails', async () => {
    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: 'UNAUTHENTICATED',
      title: 'no refresh',
      status: 401,
    });

    const { getByTestId } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(getByTestId('status').textContent).toBe('anonymous:no-user'),
    );
  });

  it('login() sets user and reports MFA when needed', async () => {
    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: 'UNAUTHENTICATED',
      title: 'x',
      status: 401,
    });
    (authApi.me as ReturnType<typeof vi.fn>).mockResolvedValue(fakeUser);
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      access_token: 'tk',
      expires_in: 900,
      user: fakeUser,
    });

    let captured: ReturnType<typeof useAuth> | null = null;
    const { getByTestId } = render(
      <AuthProvider>
        <Probe onAuth={(a) => (captured = a)} />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(getByTestId('status').textContent).toBe('anonymous:no-user'),
    );

    await act(async () => {
      const r = await captured!.login({ email: 'a@b.c', password: 'pw' });
      expect(r.requiresMfa).toBe(false);
    });

    await waitFor(() =>
      expect(getByTestId('status').textContent).toBe('authenticated:a@b.c'),
    );
  });

  it('login() detects TWO_FACTOR_REQUIRED', async () => {
    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: 'UNAUTHENTICATED',
      title: 'x',
      status: 401,
    });
    (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: 'TWO_FACTOR_REQUIRED',
      title: 'mfa',
      status: 401,
      mfa_token: 'mfa-xyz',
    });

    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onAuth={(a) => (captured = a)} />
      </AuthProvider>,
    );

    await waitFor(() => expect(captured).not.toBeNull());

    await act(async () => {
      const r = await captured!.login({ email: 'a@b.c', password: 'pw' });
      expect(r.requiresMfa).toBe(true);
      expect(r.mfaToken).toBe('mfa-xyz');
    });
  });
});
