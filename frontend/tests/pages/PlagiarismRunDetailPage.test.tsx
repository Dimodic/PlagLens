/**
 * Tests for PlagiarismRunDetailPage:
 * - renders header + status badge
 * - renders aggregate stat cards
 * - shows pairs tab default and switches to clusters
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/plagiarism', async () => {
  const run = {
    id: 'plg_42',
    tenant_id: 't1',
    course_id: 'c1',
    assignment_id: 'asn_1',
    provider: 'jplag' as const,
    status: 'completed' as const,
    trigger: 'manual' as const,
    scope: { assignment_ids: ['asn_1'], with_corpus: true },
    options: { min_tokens: 9, similarity_threshold: 0.6 },
    started_at: '2026-05-01T10:00:00Z',
    finished_at: '2026-05-01T10:05:00Z',
    submissions_count: 87,
    pairs_total: 100,
    pairs_suspected: 5,
    max_similarity: 0.94,
    artifact_html_uri: null,
    artifact_json_uri: null,
    artifact_archive_uri: null,
    error: null,
    created_at: '2026-05-01T10:00:00Z',
  };
  const report = {
    run_id: 'plg_42',
    assignment_id: 'asn_1',
    provider: 'jplag' as const,
    status: 'completed' as const,
    submissions_count: 87,
    summary: {
      max_similarity: 0.94,
      mean_similarity: 0.18,
      pairs_total: 100,
      pairs_suspected: 5,
      clusters_count: 3,
      languages: { python: 87 },
    },
    started_at: run.started_at,
    finished_at: run.finished_at,
    options_used: run.options,
    artifacts: {},
  };
  return {
    plagiarismApi: {
      getRun: vi.fn().mockResolvedValue(run),
      getReport: vi.fn().mockResolvedValue(report),
      listPairs: vi.fn().mockResolvedValue({ data: [], pagination: { has_more: false, next_cursor: null, limit: 200 } }),
      listClusters: vi.fn().mockResolvedValue({ data: [], pagination: { has_more: false, next_cursor: null, limit: 50 } }),
      cancelRun: vi.fn(),
      retryRun: vi.fn(),
      getArtifactUrl: vi.fn(),
    },
  };
});

import { PlagiarismRunDetailPage } from '@/pages/plagiarism/PlagiarismRunDetailPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/plagiarism-runs/plg_42']}>
          <Routes>
            <Route path="/plagiarism-runs/:runId" element={<PlagiarismRunDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PlagiarismRunDetailPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders header with provider and status', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Plagiarism run/i)).toBeInTheDocument();
    });
    expect(screen.getByText('jplag')).toBeInTheDocument();
    expect(screen.getByText('Готово')).toBeInTheDocument();
  });

  it('renders aggregate statistics cards', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('94.0%')).toBeInTheDocument(); // max_similarity
    });
    expect(screen.getByText('18.0%')).toBeInTheDocument(); // mean_similarity
    expect(screen.getByText('100')).toBeInTheDocument(); // pairs_total
  });

  it('switches to Clusters tab without crashing', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Plagiarism run/i)).toBeInTheDocument();
    });
    const tab = screen.getByRole('tab', { name: /Кластеры/i });
    fireEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByText(/Кластеров нет/i)).toBeInTheDocument();
    });
  });
});
