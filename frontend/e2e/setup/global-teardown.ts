/**
 * Playwright global-teardown — runs once after all tests finish.
 *
 * Currently a no-op for local dev. In CI mode (E2E_CLEANUP=1) we delete
 * stray test users / courses / tenants created by tests that did not clean
 * up after themselves.
 */
import type { FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig): Promise<void> {
  if (process.env.E2E_CLEANUP === '1') {
    // Cleanup hook for CI. Implementation can be added once domain agents
    // begin creating long-lived resources we want to drop.
    console.log('[global-teardown] CI cleanup mode — no domain resources to wipe yet');
  }
}

export default globalTeardown;
