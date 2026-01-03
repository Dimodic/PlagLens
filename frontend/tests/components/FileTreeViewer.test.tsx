/**
 * FileTreeViewer — verifies recursive tree building from flat file list.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/dom';
import { renderRaw } from '../testHelpers';
import { FileTreeViewer } from '@/components/submissions/FileTreeViewer';
import type { SubmissionFile } from '@/api/endpoints/submissions';

const files: SubmissionFile[] = [
  {
    id: 'f_1',
    submission_id: 's_1',
    path: 'src/main.py',
    size_bytes: 100,
    mime_type: 'text/x-python',
    content_hash: 'h1',
  },
  {
    id: 'f_2',
    submission_id: 's_1',
    path: 'src/lib/util.py',
    size_bytes: 200,
    mime_type: 'text/x-python',
    content_hash: 'h2',
  },
  {
    id: 'f_3',
    submission_id: 's_1',
    path: 'README.md',
    size_bytes: 50,
    mime_type: 'text/markdown',
    content_hash: 'h3',
  },
];

describe('FileTreeViewer', () => {
  it('renders folders and files', () => {
    const onSelect = vi.fn();
    renderRaw(
      <FileTreeViewer
        files={files}
        selectedFileId={null}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('main.py')).toBeInTheDocument();
    expect(screen.getByText('util.py')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('calls onSelect when a file is clicked', () => {
    const onSelect = vi.fn();
    renderRaw(
      <FileTreeViewer
        files={files}
        selectedFileId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('main.py'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f_1' }),
    );
  });
});
