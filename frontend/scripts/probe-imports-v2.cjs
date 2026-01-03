/**
 * Verify the new /imports surface is operationally distinct from /integrations:
 *   - has a "Запустить импорт" quick-run strip
 *   - has a "История импортов" section listing all import-jobs across all
 *     integrations in the tenant
 *   - empty state when nothing is connected
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
  page.on('pageerror', (e) => httpErrors.push('PAGEERR ' + e.message));

  // Teacher with 2 integrations
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });

  await page.evaluate(() => {
    window.history.pushState({}, '', '/imports');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1800);

  const quick = await page.locator('[data-testid="imports-quick-run"]').count();
  const hist = await page.locator('[data-testid="imports-history"]').count();
  const runButtons = await page.locator('[data-testid^="imports-run-"]').count();
  console.log(`/imports (teacher, populated):`);
  console.log(`  quick-run section: ${quick === 1 ? '✓' : '✗'}`);
  console.log(`  history section:   ${hist === 1 ? '✓' : '✗'}`);
  console.log(`  run-buttons:       ${runButtons}`);

  // What's in the history rows?
  const rows = await page.locator('[data-testid^="imports-job-"]').count();
  console.log(`  history rows:      ${rows}`);

  await page.screenshot({ path: `${SHOTS}/v2-imports.png`, fullPage: true });

  await ctx.close();

  // Empty state under admin
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
  const emptyVisible = await page2.locator('[data-testid="imports-empty"]').count();
  const ctaVisible = await page2.locator('[data-testid="imports-empty-cta"]').count();
  console.log(`\n/imports (admin, empty tenant):`);
  console.log(`  empty state: ${emptyVisible === 1 ? '✓' : '✗'}`);
  console.log(`  CTA button:  ${ctaVisible === 1 ? '✓' : '✗'}`);
  await page2.screenshot({ path: `${SHOTS}/v2-imports-empty.png`, fullPage: true });

  console.log('\nHTTP errors:');
  if (httpErrors.length === 0) console.log('  (none)');
  else httpErrors.forEach((e) => console.log('  • ' + e));

  await browser.close();
})();
