/**
 * Page Object: /plagiarism-runs/:runId/pairs/:pairId — side-by-side diff page.
 */
import type { Locator, Page } from '@playwright/test';

export class PairDiffPage {
  constructor(public readonly page: Page) {}

  async open(runId: string, pairId: string): Promise<void> {
    await this.page.goto(`/plagiarism-runs/${runId}/pairs/${pairId}`);
  }

  get diff(): Locator {
    return this.page.getByTestId('pair-side-by-side-diff');
  }

  get leftPane(): Locator {
    return this.page.getByTestId('pair-pane-left');
  }

  get rightPane(): Locator {
    return this.page.getByTestId('pair-pane-right');
  }

  get fragmentsAccordion(): Locator {
    return this.page.getByTestId('pair-fragments-accordion');
  }

  fragmentItem(i: number): Locator {
    return this.page.getByTestId(`pair-diff-fragment-${i}`);
  }

  fragmentControl(i: number): Locator {
    return this.page.getByTestId(`pair-diff-fragment-${i}-control`);
  }

  fragmentToggle(i: number): Locator {
    return this.page.getByTestId(`pair-diff-fragment-${i}-toggle`);
  }

  /**
   * Find a code line by its 1-based number inside one of the diff panes.
   * Use this after clicking a fragment to assert the pane scrolled to it.
   */
  paneLine(side: 'left' | 'right', lineNo: number): Locator {
    const pane = side === 'left' ? this.leftPane : this.rightPane;
    return pane.locator(`[data-line="${lineNo}"]`);
  }

  /** Returns lines whose `data-fragment` attribute equals the given index. */
  paneLinesByFragment(side: 'left' | 'right', fragmentIdx: number): Locator {
    const pane = side === 'left' ? this.leftPane : this.rightPane;
    return pane.locator(`[data-fragment="${fragmentIdx}"]`);
  }
}
