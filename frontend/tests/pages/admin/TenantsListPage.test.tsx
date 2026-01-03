/**
 * Tests for TenantsListPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/tenants', () => {
  return {
    tenantsApi: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'tnt_hse',
            slug: 'hse',
            name: 'HSE University',
            status: 'active',
            settings: {},
            cors_origins: [],
            users_count: 142,
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'tnt_demo',
            slug: 'demo',
            name: 'Demo Tenant',
            status: 'suspended',
            settings: {},
            cors_origins: [],
            users_count: 5,
            created_at: '2026-02-01T00:00:00Z',
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 100 },
      }),
    },
  };
});

import { TenantsListPage } from '@/pages/admin/TenantsListPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/tenants']}>
          <TenantsListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('TenantsListPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Тенанты' })).toBeInTheDocument();
    });
  });

  it('renders tenant slugs', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('hse')).toBeInTheDocument();
      expect(screen.getByText('demo')).toBeInTheDocument();
    });
  });

  it('renders status badges', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('suspended')).toBeInTheDocument();
    });
  });

  it('renders user counts', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('142')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
