const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.history.pushState({}, '', '/me/submissions');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/inbox.png', clip: { x: 0, y: 0, width: 1280, height: 700 } });

  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const rows = Array.from(document.querySelectorAll('[data-testid^="submission-table-row-"]'));
    return {
      title: h1?.textContent?.trim() ?? '',
      rowCount: rows.length,
      bodyExcerpt: document.body.innerText.slice(0, 600),
    };
  });
  console.log('title:', data.title);
  console.log('row count:', data.rowCount);
  console.log('body excerpt:', data.bodyExcerpt.replace(/\n/g, ' | ').slice(0, 500));
  await browser.close();
})();
