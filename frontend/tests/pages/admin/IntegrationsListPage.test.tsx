/**
 * Tests for IntegrationsListPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/integrations', () => {
  return {
    integrationsApi: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'int_1',
            tenant_id: 't1',
            course_id: 'c1',
            kind: 'stepik',
            display_name: 'Stepik 2026',
            status: 'active',
            settings: {},
            cursor: null,
            last_sync_at: '2026-05-01T10:00:00Z',
            last_sync_status: 'success',
            last_sync_error: null,
            created_by: 'u1',
            created_at: '2026-04-01T00:00:00Z',
            updated_at: '2026-05-01T10:00:00Z',
          },
          {
            id: 'int_2',
            tenant_id: 't1',
            course_id: null,
            kind: 'telegram',
            display_name: 'TG bot',
            status: 'pending_auth',
            settings: {},
            cursor: null,
            last_sync_at: null,
            last_sync_status: null,
            last_sync_error: null,
            created_by: 'u1',
            created_at: '2026-04-15T00:00:00Z',
            updated_at: '2026-04-15T00:00:00Z',
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 100 },
      }),
      test: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      syncNow: vi.fn(),
    },
  };
});

import { IntegrationsListPage } from '@/pages/admin/IntegrationsListPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/integrations']}>
          <IntegrationsListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('IntegrationsListPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Интеграции' })).toBeInTheDocument();
    });
  });

  it('renders integration display names', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Stepik 2026')).toBeInTheDocument();
      expect(screen.getByText('TG bot')).toBeInTheDocument();
    });
  });

  it('renders status labels', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('активно')).toBeInTheDocument();
      expect(screen.getByText('нужна авторизация')).toBeInTheDocument();
    });
  });

  it('renders kinds in monospace cell', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('stepik')).toBeInTheDocument();
      expect(screen.getByText('telegram')).toBeInTheDocument();
    });
  });
});
