/**
 * Tests for AuditEventsPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/audit', () => {
  return {
    auditApi: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'evt_1',
            tenant_id: 't1',
            occurred_at: '2026-05-01T10:00:00Z',
            recorded_at: '2026-05-01T10:00:01Z',
            actor: { type: 'user', id: 'usr_1', role: 'admin' },
            action: 'user.password_changed',
            resource: { type: 'user', id: 'usr_1' },
            result: 'success',
            source_service: 'identity',
            request_id: 'req_xyz',
            ip: '10.0.0.1',
            user_agent: 'Mozilla/5.0',
            before: null,
            after: null,
            metadata: {},
            retention_class: 'long',
          },
          {
            id: 'evt_2',
            tenant_id: 't1',
            occurred_at: '2026-05-01T11:00:00Z',
            recorded_at: '2026-05-01T11:00:01Z',
            actor: { type: 'user', id: 'usr_2' },
            action: 'rbac.access_denied',
            resource: { type: 'submission', id: 'sub_1' },
            result: 'failure',
            source_service: 'submission',
            request_id: null,
            ip: null,
            user_agent: null,
            before: null,
            after: null,
            metadata: {},
            retention_class: 'long',
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 50 },
      }),
    },
  };
});

import { AuditEventsPage } from '@/pages/admin/audit/AuditEventsPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/audit']}>
          <AuditEventsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('AuditEventsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders heading', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Аудит' })).toBeInTheDocument();
    });
  });

  it('renders event actions', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('user.password_changed')).toBeInTheDocument();
      expect(screen.getByText('rbac.access_denied')).toBeInTheDocument();
    });
  });

  it('renders success and failure badges', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('success')).toBeInTheDocument();
      expect(screen.getByText('failure')).toBeInTheDocument();
    });
  });

  it('updates the actor input value', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('user.password_changed')).toBeInTheDocument();
    });
    const input = screen.getByTestId('audit-actor-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'usr_42' } });
    expect(input.value).toBe('usr_42');
  });
});
