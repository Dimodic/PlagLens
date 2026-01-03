/**
 * ExportsListPage — list and create modal.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders, teacherUser } from '../../testHelpers';
import ExportsListPage from '@/pages/reporting/ExportsListPage';

vi.mock('@/api/endpoints/reporting', () => ({
  reportingApi: {
    listExports: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'exp_1',
          kind: 'course_summary',
          scope: {},
          format: 'xlsx',
          status: 'completed',
          artifact_size_bytes: 12345,
          created_at: '2026-05-07T00:00:00Z',
        },
        {
          id: 'exp_2',
          kind: 'plagiarism_report',
          scope: {},
          format: 'pdf',
          status: 'failed',
          artifact_size_bytes: null,
          error: { title: 'Boom' },
          created_at: '2026-05-06T00:00:00Z',
        },
      ],
      pagination: { has_more: false, next_cursor: null, limit: 50 },
    }),
    startGenericExport: vi.fn(),
    downloadExport: vi.fn(),
    retryExport: vi.fn(),
    cancelExport: vi.fn(),
    deleteExport: vi.fn(),
  },
}));

describe('ExportsListPage', () => {
  it('renders rows', async () => {
    renderWithProviders(<ExportsListPage />, { user: teacherUser });
    await waitFor(() => {
      expect(screen.getByTestId('export-row-exp_1')).toBeInTheDocument();
      expect(screen.getByTestId('export-row-exp_2')).toBeInTheDocument();
    });
  });

  it('shows download for completed and retry for failed', async () => {
    renderWithProviders(<ExportsListPage />, { user: teacherUser });
    await waitFor(() => {
      expect(screen.getByTestId('download-exp_1')).toBeInTheDocument();
      expect(screen.getByTestId('retry-exp_2')).toBeInTheDocument();
    });
  });

  it('opens create modal on button click', async () => {
    renderWithProviders(<ExportsListPage />, { user: teacherUser });
    const btn = await screen.findByText(/Новый экспорт/);
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId('export-create-modal')).toBeInTheDocument();
    });
  });
});
