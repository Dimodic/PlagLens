/**
 * Reproduce the user's "404 when opening Stepik" path: log in as admin, walk
 * through /admin/integrations and the OAuth providers page, and screenshot
 * every step. Records the URL we land on after each navigation/click so we
 * can see *which* page is reporting 404.
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
  const httpProblems = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400 && !u.endsWith('/auth/refresh')) {
      httpProblems.push(`HTTP ${r.status()} ${u}`);
    }
  });

  // Log in as admin
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-admin"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
  console.log('logged in, at:', page.url());

  // Try every plausible Stepik admin path
  const tries = [
    '/admin/integrations',
    '/admin/integrations/oauth-providers',
    '/integrations/stepik/setup',
    '/admin/integrations/stepik',
    '/admin/integrations/stepik/setup',
  ];

  for (const path of tries) {
    await page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForLoadState('networkidle').catch(() => {});
    const title = await page.title();
    const h1 = await page
      .locator('h1, h2')
      .first()
      .innerText({ timeout: 1500 })
      .catch(() => '(no heading)');
    const body = await page.textContent('body').catch(() => '');
    const is404 = body.includes('Страница не найдена') || body.includes('404');
    console.log(
      `  ${path.padEnd(45)}  url=${page.url()}  title=${title}  h1='${h1.replace(/\s+/g, ' ').slice(0, 60)}'  ${is404 ? '404' : 'OK'}`,
    );
    await page.screenshot({
      path: `${SHOTS}/probe-${path.replace(/[^\w]+/g, '_')}.png`,
      fullPage: true,
    });
  }

  // Now try clicking the Stepik card on /admin/integrations/oauth-providers
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/integrations/oauth-providers');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  console.log('\non oauth-providers page:', page.url());

  const stepikCard = page.locator('[data-testid="oauth-provider-stepik"]');
  const exists = await stepikCard.count();
  console.log('  Stepik card on page:', exists);

  if (exists) {
    const editBtn = page.locator('[data-testid="oauth-edit-stepik"]');
    if (await editBtn.count()) {
      await editBtn.click();
      await page.waitForTimeout(800);
      const dialogOpen = await page
        .locator('[role="dialog"]')
        .count();
      console.log('  click "Настроить" → dialog open?', dialogOpen);
      await page.screenshot({
        path: `${SHOTS}/probe-stepik-dialog.png`,
        fullPage: true,
      });
    }
  }

  console.log('\n=== HTTP problems ===');
  if (httpProblems.length === 0) console.log('  (none)');
  else httpProblems.forEach((p) => console.log('  • ' + p));

  await browser.close();
})();
