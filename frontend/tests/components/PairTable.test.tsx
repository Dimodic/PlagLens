import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { PairTable } from '@/components/plagiarism/PairTable';
import { theme } from '@/theme';
import type { PlagiarismPair } from '@/api/endpoints/plagiarism';

const pairs: PlagiarismPair[] = [
  {
    id: 'pair_1',
    run_id: 'plg_42',
    a_submission_id: 'sub_a',
    b_submission_id: 'sub_b',
    a_author: { id: 'u1', display_name: 'Alice' },
    b_author: { id: 'u2', display_name: 'Bob' },
    similarity: 0.82,
    matched_tokens: 412,
    fragments_count: 3,
    cross_course: true,
    cross_assignment: false,
    evidence_url: '/v1/x',
  },
];

function withProviders(ui: React.ReactNode) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>
  );
}

describe('<PairTable />', () => {
  it('renders rows with author names and stats', () => {
    render(withProviders(<PairTable pairs={pairs} runId="plg_42" />));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders empty state when no pairs', () => {
    render(withProviders(<PairTable pairs={[]} runId="plg_42" />));
    expect(screen.getByText(/Пар не найдено/i)).toBeInTheDocument();
  });

  it('renders cross-course badge', () => {
    render(withProviders(<PairTable pairs={pairs} runId="plg_42" />));
    expect(screen.getByText('курс')).toBeInTheDocument();
  });
});
