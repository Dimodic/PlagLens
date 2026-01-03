// Same scenario as host probe, but hits PROD nginx on port 5173 (the old
// pre-fix bundle that lives in the static build).
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

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('[data-testid="login-email"]', 'gordenko.mk@edu.hse.ru');
  await page.fill('[data-testid="login-password"]', 'changeme');
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL((u) => !u.toString().endsWith('/login'), { timeout: 15000 });
  console.log('logged in:', page.url());

  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  const allOpens = await page.locator('a:has-text("Открыть"), button:has-text("Открыть")').all();
  console.log('Открыть elements:', allOpens.length);
  let stepikOpen = null;
  for (const el of allOpens) {
    const href = await el.getAttribute('href').catch(() => null);
    const cardText = await el
      .locator('xpath=ancestor::*[contains(@class,"rounded")][1]')
      .innerText()
      .catch(() => '');
    if (/Stepik/i.test(cardText) && !/Yandex/i.test(cardText)) {
      console.log(`Stepik «Открыть» href = ${href}`);
      stepikOpen = el;
    }
  }
  if (stepikOpen) {
    await stepikOpen.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    const url = page.url();
    const h1 = await page.locator('h1, h2').first().innerText({ timeout: 1500 }).catch(() => '');
    const body = await page.textContent('body').catch(() => '');
    const is404 = body.includes('Страница не найдена') || />404</.test(body);
    console.log(`after click: url=${url}  h1='${h1.replace(/\s+/g, ' ').slice(0, 60)}'  ${is404 ? '404 BAD' : 'OK'}`);
    await page.screenshot({ path: '/tmp/prod-after-click.png', fullPage: true });
  }
  await browser.close();
})();
