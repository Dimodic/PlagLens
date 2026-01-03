/**
 * Verify the «Тест» button on the Stepik integration page returns OK.
 * - host:5173 (prod nginx, the same URL the user is on)
 * - logs in as Гopденко
 * - opens /integrations/{id} via Открыть
 * - clicks Тест
 * - reports the toast text + backend response
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
  const apiResponses = [];
  page.on('response', async (r) => {
    if (r.url().includes(':test')) {
      try {
        const body = await r.text();
        apiResponses.push({ status: r.status(), body });
      } catch {}
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('[data-testid="login-email"]', 'gordenko.mk@edu.hse.ru');
  await page.fill('[data-testid="login-password"]', 'changeme');
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL((u) => !u.toString().endsWith('/login'), { timeout: 15000 });

  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations/ic_ab80daf0834173');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Click Тест button
  await page.click('button:has-text("Тест")');
  await page.waitForTimeout(2000);

  // Capture toast text
  const toasts = await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts();
  console.log('toasts:', toasts);
  console.log('\n:test API responses:');
  for (const r of apiResponses) {
    const parsed = (() => {
      try { return JSON.parse(r.body); } catch { return null; }
    })();
    console.log(`  HTTP ${r.status}  ok=${parsed?.ok}  detail=${parsed?.detail ?? '(none)'}`);
  }

  await page.screenshot({ path: `${SHOTS}/test-result.png`, fullPage: true });
  await browser.close();
})();
