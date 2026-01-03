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
  await page.click('[data-testid="demo-login-admin"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const list = [];
    document.querySelectorAll('h2').forEach((el) => {
      const rect = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      list.push({
        text: el.innerText.trim().slice(0, 60),
        cls: el.className,
        visible: rect.width > 0 && rect.height > 0 && c.visibility !== 'hidden' && c.display !== 'none',
        rectTop: rect.top,
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        lineHeight: c.lineHeight,
      });
    });
    return { url: location.href, list };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
