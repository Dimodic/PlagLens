// Measure every visible heading / label / control on /import so we can answer
// the question "is the page exactly the right Kaggle-aligned size?".
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
  await page.evaluate(() => {
    window.history.pushState({}, '', '/imports');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);

  const items = await page.evaluate(() => {
    function vis(el) {
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && r.top >= 0;
    }
    const out = [];
    const selectors = [
      'h1', 'h2', 'h3', 'h4',
      'p',
      'button:not([disabled])',
      'label',
      '[role="radio"]',
      '[role="tab"]',
    ];
    for (const sel of selectors) {
      const list = document.querySelectorAll(sel);
      for (const el of list) {
        if (!vis(el)) continue;
        const c = getComputedStyle(el);
        const txt = el.innerText?.trim().slice(0, 60) || '';
        out.push({
          tag: el.tagName.toLowerCase(),
          text: txt,
          fontSize: c.fontSize,
          fontWeight: c.fontWeight,
          lineHeight: c.lineHeight,
          padding: c.padding,
        });
      }
    }
    return out;
  });

  console.log('=== visible text elements on /import ===');
  for (const it of items) {
    console.log(`${it.tag.padEnd(8)} fz=${it.fontSize.padEnd(7)} fw=${it.fontWeight.padEnd(4)} lh=${it.lineHeight.padEnd(7)} "${it.text}"`);
  }
  await page.screenshot({ path: '/tmp/import-page-measured.png', fullPage: true });
  await browser.close();
})();
