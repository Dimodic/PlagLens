/**
 * Tests for MyApiKeysPage.
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
      listMyApiKeys: vi.fn().mockResolvedValue([
        {
          id: 'key_1',
          name: 'ci',
          scopes: ['submissions:read'],
          created_at: '2026-04-01T00:00:00Z',
          last_used_at: '2026-04-30T00:00:00Z',
          expires_at: null,
          revoked_at: null,
        },
        {
          id: 'key_2',
          name: 'export-script',
          scopes: ['reports:read'],
          created_at: '2026-04-15T00:00:00Z',
          last_used_at: null,
          expires_at: '2027-04-15T00:00:00Z',
          revoked_at: null,
        },
      ]),
      createMyApiKey: vi.fn(),
      rotateMyApiKey: vi.fn(),
      deleteMyApiKey: vi.fn(),
    },
  };
});

import { MyApiKeysPage } from '@/pages/me/MyApiKeysPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <MyApiKeysPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('MyApiKeysPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'API keys' })).toBeInTheDocument();
  });

  it('renders rows of api keys', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('ci')).toBeInTheDocument();
      expect(screen.getByText('export-script')).toBeInTheDocument();
    });
    expect(screen.getByText('submissions:read')).toBeInTheDocument();
    expect(screen.getByText('reports:read')).toBeInTheDocument();
  });

  it('opens create modal when Создать is clicked', async () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Создать' });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('Создать API-ключ')).toBeInTheDocument();
    });
  });
});
