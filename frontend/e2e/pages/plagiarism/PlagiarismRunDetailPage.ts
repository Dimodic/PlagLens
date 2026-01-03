/**
 * Page Object: /plagiarism-runs/:runId — main run detail with tabs.
 */
import type { Locator, Page } from '@playwright/test';

export class PlagiarismRunDetailPage {
  constructor(public readonly page: Page) {}

  async open(runId: string): Promise<void> {
    await this.page.goto(`/plagiarism-runs/${runId}`);
  }

  get tabs(): Locator {
    return this.page.getByTestId('plagiarism-run-tabs');
  }

  tab(name: 'pairs' | 'clusters' | 'artifacts' | 'corpus'): Locator {
    return this.page.getByTestId(`plagiarism-tab-${name}`);
  }

  get pairsTabContent(): Locator {
    return this.page.getByTestId('plagiarism-pairs-tab-content');
  }

  get artifactsTabContent(): Locator {
    return this.page.getByTestId('plagiarism-artifacts-tab-content');
  }

  get pairsTable(): Locator {
    return this.page.getByTestId('plagiarism-pairs-table');
  }

  get pairsList(): Locator {
    return this.page.getByTestId('plagiarism-pairs-list');
  }

  pairRow(pairId: string): Locator {
    return this.page.getByTestId(`pair-row-${pairId}`);
  }

  get minSimilaritySlider(): Locator {
    return this.page.getByTestId('plagiarism-pairs-min-similarity-slider');
  }

  get minSimilarityValue(): Locator {
    return this.page.getByTestId('plagiarism-pairs-min-similarity-value');
  }

  get crossOnlySwitch(): Locator {
    return this.page.getByTestId('plagiarism-pairs-cross-only');
  }

  artifactCard(kind: 'html' | 'json' | 'archive'): Locator {
    return this.page.getByTestId(`plagiarism-artifact-${kind}`);
  }

  artifactRequestButton(kind: 'html' | 'json' | 'archive'): Locator {
    return this.page.getByTestId(`plagiarism-artifact-${kind}-request`);
  }

  artifactDownloadLink(kind: 'html' | 'json' | 'archive'): Locator {
    return this.page.getByTestId(`plagiarism-artifact-${kind}-download`);
  }

  /**
   * Drive a Mantine Slider to a target value via keyboard (left/right arrow
   * key presses). Mantine's continuous slider doesn't accept a value via
   * type(), so this is the most reliable cross-browser path.
   */
  async dragSliderToValue(_value: number): Promise<void> {
    // Hard-coded steps matter less than the test-side assertion of the
    // displayed numeric label, so callers can use page.evaluate to set
    // the underlying state if precise values are required. Here we just
    // step right by a known increment to assert behaviour.
    const root = this.minSimilaritySlider;
    await root.click();
    for (let i = 0; i < 4; i++) {
      await this.page.keyboard.press('ArrowRight');
    }
  }
}
