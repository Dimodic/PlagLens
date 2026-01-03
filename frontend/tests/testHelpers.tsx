/**
 * Shared test helpers for rendering pages/components that require Mantine,
 * Router, QueryClient and (optionally) AuthProvider.
 */
import { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';
import type { CurrentUser } from '@/api/types';
import { theme } from '@/theme';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: 0 },
    },
  });
}

export const studentUser: CurrentUser = {
  id: 'usr_student',
  email: 's@plaglens.test',
  display_name: 'Student',
  avatar_url: null,
  locale: 'ru',
  timezone: null,
  global_role: 'student',
  course_roles: {},
  tenant: { id: 't_1', slug: 'demo', name: 'Demo' },
  email_verified: true,
  two_factor_enabled: false,
  linked_oauth: [],
  last_login_at: null,
};

export const teacherUser: CurrentUser = {
  ...studentUser,
  id: 'usr_teacher',
  email: 't@plaglens.test',
  display_name: 'Teacher',
  global_role: 'teacher',
  course_roles: { c_1: 'owner' },
};

export const adminUser: CurrentUser = {
  ...studentUser,
  id: 'usr_admin',
  email: 'a@plaglens.test',
  global_role: 'admin',
  course_roles: {},
};

interface MockAuthOpts {
  user?: CurrentUser | null;
}

function mockAuthContext(user: CurrentUser | null): AuthContextValue {
  return {
    status: user ? 'authenticated' : 'anonymous',
    user,
    accessToken: user ? 'tok' : null,
    login: async () => ({ requiresMfa: false }),
    register: async () => undefined,
    logout: async () => undefined,
    refresh: async () => !!user,
    reloadMe: async () => undefined,
  };
}

interface RenderOpts extends MockAuthOpts {
  initialEntries?: string[];
  path?: string;
}

/**
 * Render a UI element wrapped in the providers needed for tests.
 * Auth context is mocked directly (no real refresh).
 */
export function renderWithProviders(
  ui: ReactElement,
  opts: RenderOpts = {},
) {
  const { user = studentUser, initialEntries = ['/'], path = '*' } = opts;
  const qc = makeQueryClient();
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={mockAuthContext(user)}>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={<div data-testid="other-route" />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

export function renderRaw(ui: ReactNode) {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      {ui}
    </MantineProvider>,
  );
}
