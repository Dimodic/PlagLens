/**
 * Shared test utilities — wrap UI in MantineProvider + QueryClient + Router.
 */
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';
import { theme } from '@/theme';

interface RenderOpts {
  route?: string;
  path?: string;
  initialEntries?: string[];
}

export function renderWithProviders(ui: ReactNode, opts: RenderOpts = {}) {
  const { route = '/', path = '/', initialEntries } = opts;
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries ?? [route]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}
