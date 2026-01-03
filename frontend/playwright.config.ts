/**
 * Playwright configuration for PlagLens E2E tests.
 *
 * Layout (under e2e/):
 *   setup/      — global-setup, global-teardown, fixtures
 *   helpers/    — auth, api, selectors, factories, waits, assertions
 *   pages/      — Page Object Models
 *   specs/      — test files split by domain (smoke, auth, ...)
 *
 * Projects:
 *   chromium-headless — default for CI
 *   chromium-headed   — for dev (slow_mo for human eyes)
 *   mobile-chrome     — Pixel 5 viewport for responsive sanity check
 *
 * Run:
 *   npx playwright test                        # all (headless)
 *   npx playwright test --project=chromium-headed
 *   npx playwright test e2e/specs/smoke/
 *   npx playwright test --ui                   # interactive
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/specs/**/*.spec.ts'],
  outputDir: 'test-results/',

  // Global setup verifies stack health, refreshes seed data, prepares auth state.
  globalSetup: path.resolve(__dirname, './e2e/setup/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, './e2e/setup/global-teardown.ts'),

  // Cross-test parallelism.
  // Workers kept low to avoid hitting the gateway's per-IP rate limit
  // during heavy auth flows (login is rate-limited at ~60/min/IP).
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 1,
  workers: IS_CI ? 2 : 2,

  expect: {
    timeout: 10_000,
  },

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    baseURL: FRONTEND_URL,
    viewport: { width: 1366, height: 768 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    // Avoid stale-state surprises when running locally.
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium-headless',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        headless: true,
      },
    },
    {
      name: 'chromium-headed',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        headless: false,
        launchOptions: { slowMo: 100 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        headless: true,
      },
      // Mobile project skipped by default for fast CI; opt-in via --project=mobile-chrome.
      grep: /@mobile/,
    },
  ],
});
