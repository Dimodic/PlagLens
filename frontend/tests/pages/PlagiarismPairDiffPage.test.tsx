/**
 * Tests for PlagiarismPairDiffPage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { theme } from '@/theme';

vi.mock('@/api/endpoints/plagiarism', () => {
  const detail = {
    id: 'pair_001',
    run_id: 'plg_42',
    similarity: 0.82,
    matched_tokens: 412,
    fragments_count: 2,
    fragments: [
      {
        a_file: 'main.py',
        a_start_line: 10,
        a_end_line: 12,
        b_file: 'sol.py',
        b_start_line: 12,
        b_end_line: 14,
        a_content: 'def add(a,b):\n    return a+b\n# end',
        b_content: 'def add(x,y):\n    return x+y\n# end',
      },
      {
        a_file: 'main.py',
        a_start_line: 20,
        a_end_line: 22,
        b_file: 'sol.py',
        b_start_line: 22,
        b_end_line: 24,
        a_content: 'class A:\n    pass\n# more',
        b_content: 'class B:\n    pass\n# more',
      },
    ],
    submissions: {
      a: { submission_id: 'sub_a', author: { id: 'u1', display_name: 'Alice' }, language: 'python' },
      b: { submission_id: 'sub_b', author: { id: 'u2', display_name: 'Bob' }, language: 'python' },
    },
  };
  return {
    plagiarismApi: {
      getPairDetail: vi.fn().mockResolvedValue(detail),
    },
  };
});

import { PlagiarismPairDiffPage } from '@/pages/plagiarism/PlagiarismPairDiffPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/plagiarism-runs/plg_42/pairs/pair_001']}>
          <Routes>
            <Route
              path="/plagiarism-runs/:runId/pairs/:pairId"
              element={<PlagiarismPairDiffPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PlagiarismPairDiffPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders header with similarity, fragment count, authors', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getAllByText(/82.0%/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
  });

  it('renders fragment accordion with line ranges', async () => {
    setup();
    await waitFor(() => {
      // Both fragments listed
      expect(screen.getByText(/main\.py:10–12 ↔ sol\.py:12–14/)).toBeInTheDocument();
      expect(screen.getByText(/main\.py:20–22 ↔ sol\.py:22–24/)).toBeInTheDocument();
    });
  });

  it('renders both file panes with filenames', async () => {
    setup();
    await waitFor(() => {
      const mainPyMentions = screen.getAllByText(/main\.py/);
      expect(mainPyMentions.length).toBeGreaterThan(0);
    });
  });

  it('renders fragment checkboxes with starting state visible=2/2', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Видимых: 2\/2/)).toBeInTheDocument();
    });
    // Toggle the first fragment off via checkbox
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);
    await waitFor(() => {
      expect(screen.getByText(/Видимых: 1\/2/)).toBeInTheDocument();
    });
  });
});
