/**
 * Tests for PromptVersionsPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/ai', () => {
  return {
    aiApi: {
      listPromptVersions: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'v1',
            name: 'Initial 2025',
            system_prompt: 'You are an assistant.',
            user_template: 'Analyse {language}.',
            json_schema: { type: 'object' },
            active_for_tenant: false,
            created_at: '2025-09-01T00:00:00Z',
            deactivated_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'v2',
            name: 'Strict 2026',
            system_prompt: 'Be strict.',
            user_template: 'Analyse {language} on course {course_name}.',
            json_schema: { type: 'object' },
            active_for_tenant: true,
            created_at: '2026-01-01T00:00:00Z',
            deactivated_at: null,
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 200 },
      }),
      getPromptVersion: vi.fn(),
      activatePromptVersion: vi.fn(),
      testPromptVersion: vi.fn(),
    },
  };
});

import { PromptVersionsPage } from '@/pages/admin/PromptVersionsPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/ai/prompt-versions']}>
          <PromptVersionsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PromptVersionsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders prompt version headings', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument();
      expect(screen.getByText('v2')).toBeInTheDocument();
    });
    expect(screen.getByText('Initial 2025')).toBeInTheDocument();
    expect(screen.getByText('Strict 2026')).toBeInTheDocument();
  });

  it('marks active version with badge', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  it('shows "Сделать активной" only for inactive versions', async () => {
    setup();
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /Сделать активной/i });
      expect(buttons).toHaveLength(1);
    });
  });
});
