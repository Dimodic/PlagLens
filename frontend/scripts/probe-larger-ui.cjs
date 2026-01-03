/**
 * Take side-by-side screenshots of the new bigger UI on key pages, plus
 * report computed font-size & button height so we can see the bump took.
 */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';
const SHOTS = '/tmp';

async function login(page, role) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click(`[data-testid="demo-login-${role}"]`);
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await login(page, 'teacher');
  console.log('=== logged in ===');

  const probe = async (path, name) => {
    await page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    const measurements = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const button = document.querySelector('button:not([disabled])');
      const input = document.querySelector('input');
      const navItem = document.querySelector('a[data-testid^="nav-item-"]');
      return {
        htmlFontSize: html.fontSize,
        bodyFontSize: body.fontSize,
        buttonHeight: button ? getComputedStyle(button).height : null,
        buttonFontSize: button ? getComputedStyle(button).fontSize : null,
        inputHeight: input ? getComputedStyle(input).height : null,
        inputFontSize: input ? getComputedStyle(input).fontSize : null,
        navItemFontSize: navItem ? getComputedStyle(navItem).fontSize : null,
      };
    });
    console.log(`\n${name} (${path}):`);
    Object.entries(measurements).forEach(([k, v]) =>
      console.log(`  ${k.padEnd(18)} = ${v}`),
    );
    await page.screenshot({ path: `${SHOTS}/big-${name}.png`, fullPage: true });
  };

  await probe('/', 'home');
  await probe('/courses', 'courses');
  await probe('/integrations', 'integrations');
  await probe('/integrations/ic_ab80daf0834173', 'integration-detail');
  await probe('/notifications', 'notifications');
  await probe('/import', 'import');

  await browser.close();
})();
