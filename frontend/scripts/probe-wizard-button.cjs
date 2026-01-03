const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  const btn = page.locator('[data-testid="integrations-new-button"]');
  const txt = await btn.innerText().catch(() => '(missing)');
  console.log(`button text:  "${txt.replace(/\s+/g, ' ')}"`);

  // Verify NO dropdown menu opens on click — it should navigate directly.
  await Promise.all([
    page.waitForURL((u) => u.toString().includes('/integrations/wizard'), { timeout: 5000 }),
    btn.click(),
  ]);
  console.log(`after click:  ${page.url()}`);

  // Also confirm zero dropdown menus exist on the page.
  await page.goBack();
  await page.waitForTimeout(500);
  const ddmCount = await page.locator('[role="menu"], [data-radix-popper-content-wrapper]').count();
  console.log(`open dropdowns on /integrations: ${ddmCount}`);

  await page.screenshot({ path: '/tmp/integrations-single-button.png', fullPage: true });
  await browser.close();
})();
