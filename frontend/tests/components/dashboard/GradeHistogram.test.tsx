/**
 * GradeHistogram — empty state + headers.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/dom';
import { renderRaw } from '../../testHelpers';
import { GradeHistogram } from '@/components/dashboard/GradeHistogram';
import type { GradesDistribution } from '@/api/endpoints/reporting';

const data: GradesDistribution = {
  buckets: [
    { bucket: '0-1', min: 0, max: 1, count: 1 },
    { bucket: '1-2', min: 1, max: 2, count: 4 },
    { bucket: '2-3', min: 2, max: 3, count: 8 },
  ],
  mean: 2.1,
  median: 2.0,
  stddev: 0.8,
};

describe('<GradeHistogram />', () => {
  it('renders header and stats when data present', () => {
    renderRaw(<GradeHistogram data={data} />);
    expect(screen.getByText('Распределение оценок')).toBeInTheDocument();
    expect(screen.getByText(/Среднее: 2\.10/)).toBeInTheDocument();
    expect(screen.getByText(/Медиана: 2\.00/)).toBeInTheDocument();
  });

  it('renders empty state when buckets empty', () => {
    renderRaw(
      <GradeHistogram
        data={{ buckets: [], mean: null, median: null, stddev: null }}
      />,
    );
    expect(screen.getByText(/Нет оценок/)).toBeInTheDocument();
  });

  it('handles undefined data without crashing', () => {
    renderRaw(<GradeHistogram data={undefined} />);
    expect(screen.getByText(/Нет оценок/)).toBeInTheDocument();
  });
});
