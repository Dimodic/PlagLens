const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 8000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  // SPA-navigate to /courses
  await page.evaluate(() => {
    window.history.pushState({}, '', '/courses');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);

  const sizes = await page.evaluate(() => {
    const out = {};
    const main = document.querySelector('[data-testid="app-main"]');
    const page = document.querySelector('[data-page-width]');
    const title = document.querySelector('[data-testid="page-title"]');
    if (main) out.main = main.getBoundingClientRect();
    if (page) {
      out.pageContainer = {
        rect: page.getBoundingClientRect(),
        mode: page.getAttribute('data-page-width'),
        computed: getComputedStyle(page).maxWidth,
      };
    }
    if (title) out.title = title.getBoundingClientRect();
    return out;
  });
  console.log(JSON.stringify(sizes, null, 2));
  await browser.close();
})();
