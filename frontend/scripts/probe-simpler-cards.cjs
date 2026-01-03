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
    window.history.pushState({}, '', '/integrations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  // Count visible buttons + overflow menus per card
  const cards = await page.locator('[data-testid^="integration-row-"]').all();
  for (const c of cards) {
    const btnTexts = await c.locator('button, a:has(button), a[role="button"]').allInnerTexts();
    const buttonsFlat = btnTexts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const menus = await c.locator('[data-testid^="integration-menu-"]').count();
    console.log(`card buttons (${buttonsFlat.length}):`, buttonsFlat);
    console.log(`  overflow menus: ${menus}`);
  }

  // Open overflow on first card
  const firstMenu = page.locator('[data-testid^="integration-menu-"]').first();
  await firstMenu.click();
  await page.waitForTimeout(300);
  const menuItems = await page.locator('[role="menuitem"]').allInnerTexts();
  console.log('overflow menu items:', menuItems.map((t) => t.replace(/\s+/g, ' ').trim()));

  await page.screenshot({ path: '/tmp/integrations-slim.png', fullPage: true });
  console.log('pageerrors:', errs.length === 0 ? '(none)' : errs);
  await browser.close();
})();
