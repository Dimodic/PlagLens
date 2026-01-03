const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations/wizard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  // pull all visible text on step 0
  const text0 = await page.locator('main, [data-testid="import-wizard-page"]').first().innerText().catch(() => '');
  console.log('--- step 0 visible text ---');
  console.log(text0);
  await page.screenshot({ path: '/tmp/wizard-step0.png', fullPage: true });

  // go to step 3 (last)
  await page.click('[data-testid="import-wizard-next"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="import-wizard-next"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="import-wizard-next"]');
  await page.waitForTimeout(400);
  const text3 = await page.locator('[data-testid="import-wizard-page"]').first().innerText().catch(() => '');
  console.log('\n--- step 3 visible text ---');
  console.log(text3);
  await page.screenshot({ path: '/tmp/wizard-step3.png', fullPage: true });

  console.log('\npage errors:', errs.length === 0 ? '(none)' : errs);
  await browser.close();
})();
