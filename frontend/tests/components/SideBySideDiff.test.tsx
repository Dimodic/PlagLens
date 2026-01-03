import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { MantineProvider } from '@mantine/core';
import { SideBySideDiff } from '@/components/plagiarism/SideBySideDiff';
import { theme } from '@/theme';
import type { PlagiarismPairFragment } from '@/api/endpoints/plagiarism';

const fragments: PlagiarismPairFragment[] = [
  {
    a_file: 'main.py',
    a_start_line: 2,
    a_end_line: 4,
    b_file: 'sol.py',
    b_start_line: 5,
    b_end_line: 7,
    a_content: 'def x():\n    return 1\n    return 2',
    b_content: 'def y():\n    return 9\n    return 8',
  },
];

function withTheme(ui: React.ReactNode) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {ui}
    </MantineProvider>
  );
}

describe('<SideBySideDiff />', () => {
  it('renders two panes with filenames', () => {
    render(
      withTheme(
        <SideBySideDiff
          left={{ filename: 'main.py', content: 'a\nb\nc\nd', authorName: 'Alice' }}
          right={{ filename: 'sol.py', content: 'x\ny\nz\nw', authorName: 'Bob' }}
          fragments={fragments}
        />,
      ),
    );
    expect(screen.getByText('main.py')).toBeInTheDocument();
    expect(screen.getByText('sol.py')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders all line numbers from content', () => {
    render(
      withTheme(
        <SideBySideDiff
          left={{ filename: 'a.txt', content: 'one\ntwo\nthree' }}
          right={{ filename: 'b.txt', content: 'four\nfive\nsix' }}
          fragments={[]}
        />,
      ),
    );
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
    expect(screen.getByText('six')).toBeInTheDocument();
  });

  it('respects highlightedFragments to limit visible zones', () => {
    const fragMulti: PlagiarismPairFragment[] = [
      { ...fragments[0] },
      {
        ...fragments[0],
        a_start_line: 6,
        a_end_line: 7,
        b_start_line: 6,
        b_end_line: 7,
        a_content: 'line\nline',
        b_content: 'line\nline',
      },
    ];
    const visibleOnlyFirst = new Set<number>([0]);
    const { container } = render(
      withTheme(
        <SideBySideDiff
          left={{ filename: 'a.txt', content: '1\n2\n3\n4\n5\n6\n7' }}
          right={{ filename: 'b.txt', content: '1\n2\n3\n4\n5\n6\n7' }}
          fragments={fragMulti}
          highlightedFragments={visibleOnlyFirst}
        />,
      ),
    );
    // Only fragment 0 should be highlighted
    const highlighted = container.querySelectorAll('[data-fragment="0"]');
    expect(highlighted.length).toBeGreaterThan(0);
    const fragment1 = container.querySelectorAll('[data-fragment="1"]');
    expect(fragment1.length).toBe(0);
  });
});
