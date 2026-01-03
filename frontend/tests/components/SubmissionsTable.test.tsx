/**
 * SubmissionsTable — verifies basic rendering, late + flag badges, empty state.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import { renderRaw } from '../testHelpers';
import { SubmissionsTable } from '@/components/submissions/SubmissionsTable';
import type { SubmissionBrief } from '@/api/endpoints/submissions';

const subs: SubmissionBrief[] = [
  {
    id: 's_1',
    assignment_id: 'a_1',
    author_id: 'u_1',
    author: {
      id: 'u_1',
      email: 'a@b.c',
      display_name: 'Alice',
      avatar_url: null,
      global_role: 'student',
      tenant_id: 't_1',
    },
    version: 2,
    source: 'manual',
    language: 'python',
    status: 'ready',
    flags: { suspicious: true, llm_attention: true },
    is_late: true,
    late_kind: 'soft',
    total_size_bytes: 1234,
    submitted_at: '2026-04-15T11:00:00Z',
    imported_at: null,
    score: 8.5,
  },
  {
    id: 's_2',
    assignment_id: 'a_1',
    author_id: 'u_2',
    author: {
      id: 'u_2',
      email: 'b@b.c',
      display_name: 'Bob',
      avatar_url: null,
      global_role: 'student',
      tenant_id: 't_1',
    },
    version: 1,
    source: 'manual',
    language: 'cpp',
    status: 'processing',
    flags: {},
    is_late: false,
    late_kind: null,
    total_size_bytes: 500,
    submitted_at: '2026-04-16T11:00:00Z',
    imported_at: null,
  },
];

describe('SubmissionsTable', () => {
  it('renders rows with author + flags + late badge', () => {
    renderRaw(
      <MemoryRouter>
        <SubmissionsTable submissions={subs} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('submission-row-s_1')).toBeInTheDocument();
    expect(screen.getByTestId('submission-row-s_2')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/8\.5/)).toBeInTheDocument();
    expect(screen.getAllByText(/late/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/подозрит/i)).toBeInTheDocument();
    expect(screen.getByText(/LLM/)).toBeInTheDocument();
  });

  it('renders empty state when no submissions', () => {
    renderRaw(
      <MemoryRouter>
        <SubmissionsTable submissions={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Нет посылок/)).toBeInTheDocument();
  });
});
