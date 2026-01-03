/**
 * CourseCard — basic render test.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import { renderRaw } from '../testHelpers';
import { CourseCard } from '@/components/courses/CourseCard';

describe('CourseCard', () => {
  it('renders name, status badge, slug', () => {
    renderRaw(
      <MemoryRouter>
        <CourseCard
          course={{
            id: 'c_1',
            name: 'Анализ данных',
            slug: 'ds-2026',
            status: 'active',
            description: 'Курс DS',
            members_count: 50,
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Анализ данных')).toBeInTheDocument();
    expect(screen.getByText('ds-2026')).toBeInTheDocument();
    expect(screen.getByText(/Активен/)).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('points to detail page via slug', () => {
    renderRaw(
      <MemoryRouter>
        <CourseCard
          course={{
            id: 'c_1',
            name: 'Алгоритмы',
            slug: 'algo',
            status: 'draft',
          }}
        />
      </MemoryRouter>,
    );
    const link = screen.getByTestId('course-card');
    expect(link).toHaveAttribute('href', '/courses/algo');
    expect(screen.getByText(/Черновик/)).toBeInTheDocument();
  });
});
