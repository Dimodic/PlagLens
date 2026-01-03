/**
 * Verify the /imports vs /integrations/wizard split:
 *   - /imports → ImportsPage (list of connected integrations OR empty state)
 *   - /integrations/wizard → ImportWizardPage (4-step setup)
 *   - dropdown on /integrations has a "Wizard" entry that navigates to it
 */
const { chromium } = require('playwright-core');
const BASE = 'http://host.docker.internal:5173';
const SHOTS = '/tmp';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const httpErrors = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().endsWith('/auth/refresh')) {
      httpErrors.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  // Login as teacher (has 2 integrations — Stepik, Yandex.Contest).
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });

  // 1. /imports populated (existing integrations show as cards)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/imports');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const importsTitle = await page.title();
  const importCards = await page.locator('[data-testid^="imports-card-"]').count();
  const emptyState = await page.locator('[data-testid="imports-empty"]').count();
  console.log(`/imports (teacher, populated):`);
  console.log(`  title=${importsTitle}  cards=${importCards}  empty=${emptyState}`);
  await page.screenshot({ path: `${SHOTS}/split-imports-populated.png`, fullPage: true });

  // 2. /integrations/wizard (4-step page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations/wizard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const wizardTitle = await page.title();
  const wizardH1 = await page
    .locator('h1')
    .first()
    .innerText()
    .catch(() => '(no h1)');
  const stepperOk = (await page.locator('[data-testid^="import-step-"]').count()) === 4;
  console.log(`\n/integrations/wizard:`);
  console.log(`  title=${wizardTitle}  h1='${wizardH1}'  stepper4=${stepperOk}`);
  await page.screenshot({ path: `${SHOTS}/split-wizard.png`, fullPage: true });

  // 3. Dropdown on /integrations contains the Wizard entry
  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="integrations-new-button"]');
  await page.waitForTimeout(300);
  const wizEntry = await page.locator('[data-testid="connect-wizard"]').count();
  console.log(`\nDropdown on /integrations:`);
  console.log(`  Wizard entry present: ${wizEntry === 1 ? '✓' : '✗ count=' + wizEntry}`);
  await page.screenshot({ path: `${SHOTS}/split-dropdown.png`, fullPage: true });

  // Clicking wizard entry should land on /integrations/wizard
  await page.click('[data-testid="connect-wizard"]');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  console.log(`  click → ${page.url()}`);

  console.log('\nHTTP errors:');
  if (httpErrors.length === 0) console.log('  (none)');
  else httpErrors.forEach((e) => console.log('  • ' + e));

  await ctx.close();

  // 4. Empty state — log in as admin (different tenant, no integrations).
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page2.click('[data-testid="demo-login-admin"]');
  await page2.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
  await page2.evaluate(() => {
    window.history.pushState({}, '', '/imports');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page2.waitForLoadState('networkidle').catch(() => {});
  await page2.waitForTimeout(1200);
  const emptyOnAdmin = await page2.locator('[data-testid="imports-empty"]').count();
  const emptyCta = await page2.locator('[data-testid="imports-empty-cta"]').count();
  console.log(`\n/imports (admin, no integrations in admin tenant):`);
  console.log(`  empty state present: ${emptyOnAdmin === 1 ? '✓' : '✗'}`);
  console.log(`  empty state CTA present: ${emptyCta === 1 ? '✓' : '✗'}`);
  await page2.screenshot({ path: `${SHOTS}/split-imports-empty.png`, fullPage: true });

  await browser.close();
})();
