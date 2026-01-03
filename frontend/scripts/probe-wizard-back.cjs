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
    window.history.pushState({}, '', '/integrations/wizard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  // Exactly ONE exit point
  const topBack = await page.locator('[data-testid="import-wizard-back"]').count();
  const cancel = await page.locator('[data-testid="import-wizard-cancel"]').count();
  const topText = await page.locator('[data-testid="import-wizard-back"]').innerText();
  console.log('top exit link count:', topBack, ' text="' + topText.trim() + '"');
  console.log('cancel button count: ', cancel, '(should be 0)');

  await page.screenshot({ path: '/tmp/wizard-minimal.png', fullPage: true });

  // Advance to step 3 — confirm the single exit still works
  await page.click('[data-testid="import-wizard-next"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="import-wizard-next"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="import-wizard-next"]');
  await page.waitForTimeout(300);
  const onStep4Back = await page.locator('[data-testid="import-wizard-back"]').count();
  const onStep4Cancel = await page.locator('[data-testid="import-wizard-cancel"]').count();
  console.log('on step 4: top-back=', onStep4Back, ' cancel=', onStep4Cancel);

  await Promise.all([
    page.waitForURL((u) => u.toString().endsWith('/integrations'), { timeout: 5000 }),
    page.locator('[data-testid="import-wizard-back"]').click(),
  ]);
  console.log('clicked top exit from step 4 →', page.url());

  await browser.close();
})();
