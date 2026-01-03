/**
 * GradeForm — verifies validation, late-hard warning, and submit/delete callbacks.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { renderRaw } from '../testHelpers';
import { GradeForm } from '@/components/submissions/GradeForm';

describe('GradeForm', () => {
  it('shows late-hard warning when isLateHard', () => {
    renderRaw(
      <GradeForm onSubmit={() => {}} maxScore={10} isLateHard />,
    );
    expect(
      screen.getByText(/после жёсткого дедлайна/i),
    ).toBeInTheDocument();
  });

  it('calls onSubmit with parsed score', async () => {
    const onSubmit = vi.fn();
    renderRaw(
      <GradeForm
        onSubmit={onSubmit}
        maxScore={10}
        initial={{ score: 7, comment: 'good', comment_visible_to_student: true }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          score: 7,
          comment: 'good',
          comment_visible_to_student: true,
        }),
      );
    });
  });

  it('exposes delete button when onDelete provided', () => {
    const onDelete = vi.fn();
    renderRaw(
      <GradeForm
        onSubmit={() => {}}
        onDelete={onDelete}
        maxScore={10}
        initial={{ score: 5 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Снять оценку/ }));
    expect(onDelete).toHaveBeenCalled();
  });
});
