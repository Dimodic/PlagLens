/**
 * Quick smoke screenshot — go to /demo, click teacher, wait for nav, screenshot.
 */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (/(favicon|net::ERR|WebSocket|5174|404)/i.test(t)) return;
      errors.push('console.error ' + t);
    }
  });

  try {
    await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
    console.log('on /demo, url=', page.url());
    await page.click('[data-testid="demo-login-teacher"]', { timeout: 8000 });
    console.log('clicked teacher login');
    // Wait until we leave /demo and the next page settles.
    try {
      await page.waitForURL((u) => !u.toString().includes('/demo'), {
        timeout: 10_000,
      });
    } catch {}
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    console.log('after wait, url=', page.url());

    // Capture for inspection
    await page.screenshot({ path: '/tmp/redesign-shots/_smoke-post-login.png' });

    // Probe DOM
    const sidebar = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="app-sidebar"]');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { width: r.width, html: s.outerHTML.slice(0, 200) };
    });
    console.log('sidebar:', sidebar);

    const main = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="app-main"]');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { width: r.width };
    });
    console.log('main:', main);

    // Hover the sidebar
    const sb = page.locator('[data-testid="app-sidebar"]').first();
    if (await sb.count()) {
      await sb.hover({ position: { x: 30, y: 200 } });
      await page.waitForTimeout(300);
      const drawer = await page.evaluate(() => {
        const d = document.querySelector('[data-testid="app-sidebar-drawer"]');
        if (!d) return null;
        const r = d.getBoundingClientRect();
        const expanded = d
          .closest('[data-testid="app-sidebar"]')
          ?.getAttribute('data-expanded');
        return { width: r.width, expanded };
      });
      console.log('drawer after hover:', drawer);
      await page.screenshot({ path: '/tmp/redesign-shots/_smoke-sidebar-hover.png' });
    }

    // Visit a few core pages
    for (const url of ['/courses', '/integrations', '/imports', '/integrations/wizard', '/settings', '/me/assignments']) {
      try {
        await page.goto('http://localhost:5173' + url, { waitUntil: 'domcontentloaded' });
        // Loud HMR + auth re-check needs a moment.
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(600);
        const finalUrl = page.url();
        if (finalUrl.includes('/login')) {
          console.log('  bounced to login on', url);
        }
        const slug = url.replace(/\//g, '_') || '_root';
        await page.screenshot({ path: `/tmp/redesign-shots/teacher${slug}.png`, fullPage: true });
        console.log('shot', url, '->', finalUrl);
      } catch (e) {
        console.log('FAIL', url, e.message);
      }
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  console.log('\nerrors:', errors.length);
  errors.slice(0, 10).forEach((e) => console.log('  ', e));
  await browser.close();
})();
