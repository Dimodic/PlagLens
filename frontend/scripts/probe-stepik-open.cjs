/**
 * Reproduce: teacher creates a Stepik integration, lands on /integrations,
 * clicks "Открыть" on the card → should NOT 404.
 */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';
const SHOTS = '/tmp';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const issues = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().endsWith('/auth/refresh')) {
      issues.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  // Login as teacher
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });

  // Go to /integrations
  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  console.log('on /integrations:', page.url());
  await page.screenshot({ path: `${SHOTS}/open-1-list.png`, fullPage: true });

  // Look for an "Открыть" link/button in any card
  const openLinks = await page.locator('a:has-text("Открыть"), button:has-text("Открыть")').all();
  console.log('Открыть links found:', openLinks.length);

  for (let i = 0; i < openLinks.length; i++) {
    const href = await openLinks[i].getAttribute('href').catch(() => null);
    console.log(`  [${i}] href=${href}`);
  }

  // Click the FIRST "Открыть" – usually the most-recent (Stepik)
  if (openLinks.length === 0) {
    console.log('NO Открыть buttons!');
    await browser.close();
    return;
  }

  const targetIdx = 0;
  const targetHref = await openLinks[targetIdx].getAttribute('href').catch(() => null);
  console.log(`clicking [${targetIdx}] href=${targetHref}`);
  await openLinks[targetIdx].click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);

  const url = page.url();
  const title = await page.title();
  const h1 = await page
    .locator('h1, h2')
    .first()
    .innerText({ timeout: 1500 })
    .catch(() => '(no heading)');
  const body = await page.textContent('body').catch(() => '');
  const is404 = body.includes('Страница не найдена') || /\b404\b/.test(body);
  console.log(`result: url=${url}  title=${title}  h1='${h1.replace(/\s+/g, ' ').slice(0, 80)}'  ${is404 ? '404' : 'OK'}`);
  await page.screenshot({ path: `${SHOTS}/open-2-detail.png`, fullPage: true });

  console.log('\nHTTP issues:');
  if (issues.length === 0) console.log('  (none)');
  else issues.forEach((i) => console.log('  • ' + i));

  await browser.close();
})();
