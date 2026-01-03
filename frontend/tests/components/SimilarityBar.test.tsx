import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import {
  SimilarityBar,
  similarityColor,
  similarityPercent,
  similarityZone,
} from '@/components/plagiarism/SimilarityBar';
import { theme } from '@/theme';

function withTheme(ui: React.ReactNode) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {ui}
    </MantineProvider>
  );
}

describe('SimilarityBar helpers', () => {
  it('similarityZone classifies low/medium/high', () => {
    expect(similarityZone(0.1)).toBe('low');
    expect(similarityZone(0.39)).toBe('low');
    expect(similarityZone(0.4)).toBe('medium');
    expect(similarityZone(0.7)).toBe('medium');
    expect(similarityZone(0.71)).toBe('high');
    expect(similarityZone(0.99)).toBe('high');
  });

  it('similarityColor maps zone to colour', () => {
    expect(similarityColor(0.2)).toBe('green');
    expect(similarityColor(0.5)).toBe('yellow');
    expect(similarityColor(0.85)).toBe('red');
  });

  it('similarityPercent formats values and clamps out-of-range', () => {
    expect(similarityPercent(0)).toBe('0.0%');
    expect(similarityPercent(0.123)).toBe('12.3%');
    expect(similarityPercent(1.5)).toBe('100.0%');
    expect(similarityPercent(-0.2)).toBe('0.0%');
  });
});

describe('<SimilarityBar />', () => {
  it('renders the formatted percentage label', () => {
    render(withTheme(<SimilarityBar value={0.42} />));
    expect(screen.getByText('42.0%')).toBeInTheDocument();
  });

  it('hides label when showLabel=false', () => {
    render(withTheme(<SimilarityBar value={0.5} showLabel={false} />));
    expect(screen.queryByText('50.0%')).toBeNull();
  });

  it('renders zero value safely', () => {
    render(withTheme(<SimilarityBar value={Number.NaN} />));
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});
