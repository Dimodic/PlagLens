/**
 * Tests for AnalysisListPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/ai', () => {
  return {
    aiApi: {
      listForAssignment: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'ai_1',
            tenant_id: 't1',
            course_id: 'c1',
            assignment_id: 'asn_1',
            submission_id: 'sub_1',
            prompt_version: 'v2',
            provider: 'openai',
            model: 'gpt-4o-mini',
            status: 'completed',
            trigger: 'manual',
            cache_hit: false,
            report: null,
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
            cost_estimate: 0.003,
            latency_ms: 1200,
            parent_analysis_id: null,
            failure_reason: null,
            shared_with_student: false,
            curated_feedback_id: null,
            started_at: '2026-05-01T10:00:00Z',
            finished_at: '2026-05-01T10:01:00Z',
            created_at: '2026-05-01T09:59:00Z',
            author: { id: 'u1', display_name: 'Alice Student' },
          },
          {
            id: 'ai_2',
            tenant_id: 't1',
            course_id: 'c1',
            assignment_id: 'asn_1',
            submission_id: 'sub_2',
            prompt_version: 'v1',
            provider: 'openai',
            model: 'gpt-4o-mini',
            status: 'failed',
            trigger: 'manual',
            cache_hit: false,
            report: null,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost_estimate: 0,
            latency_ms: 0,
            parent_analysis_id: null,
            failure_reason: 'rate limit',
            shared_with_student: false,
            curated_feedback_id: null,
            started_at: null,
            finished_at: null,
            created_at: '2026-05-01T11:00:00Z',
            author: { id: 'u2', display_name: 'Bob Student' },
          },
        ],
        pagination: { has_more: false, next_cursor: null, limit: 200 },
      }),
    },
  };
});

import { AnalysisListPage } from '@/pages/ai/AnalysisListPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/assignments/asn_1/ai-analyses']}>
          <Routes>
            <Route
              path="/assignments/:assignmentId/ai-analyses"
              element={<AnalysisListPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('AnalysisListPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the page title', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /AI-анализы/i })).toBeInTheDocument();
    });
  });

  it('renders rows with author names and statuses', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Alice Student')).toBeInTheDocument();
      expect(screen.getByText('Bob Student')).toBeInTheDocument();
    });
    expect(screen.getByText('Готово')).toBeInTheDocument();
    expect(screen.getByText('Ошибка')).toBeInTheDocument();
  });

  it('renders cost values formatted', async () => {
    setup();
    await waitFor(() => {
      // 0.003 USD → "0.30¢" (sub-cent: actually 0.30¢)
      expect(screen.getByText('0.30¢')).toBeInTheDocument();
    });
  });
});
