import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { CostFormatter, formatCost } from '@/components/ai/CostFormatter';
import { theme } from '@/theme';

function withTheme(ui: React.ReactNode) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {ui}
    </MantineProvider>
  );
}

describe('formatCost', () => {
  it('returns dash for null/undefined/NaN', () => {
    expect(formatCost(null)).toBe('—');
    expect(formatCost(undefined)).toBe('—');
    expect(formatCost(Number.NaN)).toBe('—');
  });

  it('formats sub-thousandth-cent in millicents', () => {
    expect(formatCost(0.00012)).toBe('0.012¢');
  });

  it('formats sub-cent values', () => {
    expect(formatCost(0.012)).toBe('1.20¢');
  });

  it('formats sub-dollar amounts', () => {
    expect(formatCost(0.123)).toBe('$0.123');
  });

  it('formats dollar amounts', () => {
    expect(formatCost(1.234)).toBe('$1.23');
  });

  it('returns $0 for zero', () => {
    expect(formatCost(0)).toBe('$0');
  });
});

describe('<CostFormatter />', () => {
  it('renders formatted text', () => {
    render(withTheme(<CostFormatter value={0.012} />));
    expect(screen.getByText('1.20¢')).toBeInTheDocument();
  });
});
