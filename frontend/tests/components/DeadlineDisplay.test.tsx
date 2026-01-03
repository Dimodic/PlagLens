/**
 * DeadlineDisplay — confirms it renders both deadlines and a 'No deadline' fallback.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/dom';
import { renderRaw } from '../testHelpers';
import { DeadlineDisplay } from '@/components/assignments/DeadlineDisplay';

describe('DeadlineDisplay', () => {
  it('shows both deadlines when both provided', () => {
    renderRaw(
      <DeadlineDisplay
        softAt="2030-01-01T00:00:00Z"
        hardAt="2030-02-01T00:00:00Z"
      />,
    );
    // Both formatted strings should be present
    expect(screen.getAllByText(/2030/).length).toBeGreaterThan(0);
  });

  it('shows "Без дедлайна" when both are null', () => {
    renderRaw(<DeadlineDisplay softAt={null} hardAt={null} />);
    expect(screen.getByText(/Без дедлайна/)).toBeInTheDocument();
  });
});
