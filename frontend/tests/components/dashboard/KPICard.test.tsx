/**
 * KPICard - rendering, formatting, loading state.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/dom';
import { renderRaw } from '../../testHelpers';
import { KPICard } from '@/components/dashboard/KPICard';

describe('<KPICard />', () => {
  it('renders integer value verbatim', () => {
    renderRaw(<KPICard label="Students" value={42} />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats large numbers (locale separators present)', () => {
    renderRaw(<KPICard label="Tokens" value={1234567} />);
    // ru-RU may use non-breaking space; just look for the digit groups.
    const txt = screen.getByText(/1\D?234\D?567/);
    expect(txt).toBeInTheDocument();
  });

  it('renders em-dash when value is null/undefined', () => {
    renderRaw(<KPICard label="x" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders skeleton when loading=true', () => {
    const { container } = renderRaw(
      <KPICard label="Loading" value={5} loading />,
    );
    // Mantine Skeleton uses class name with "Skeleton-root"
    expect(
      container.querySelectorAll('[class*="Skeleton"]').length,
    ).toBeGreaterThan(0);
  });

  it('renders string values as-is', () => {
    renderRaw(<KPICard label="Cost" value="$12.50" />);
    expect(screen.getByText('$12.50')).toBeInTheDocument();
  });

  it('renders fractional numbers with two decimals', () => {
    renderRaw(<KPICard label="Avg" value={4.123} />);
    expect(screen.getByText('4.12')).toBeInTheDocument();
  });
});
