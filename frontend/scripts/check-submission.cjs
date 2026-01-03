const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // open the inbox to grab a submission id
  await page.evaluate(() => {
    window.history.pushState({}, '', '/me/submissions');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(2000);
  const firstSubLink = await page.$$eval(
    '[data-testid^="submission-table-row-"]',
    (els) => (els[0] ? els[0].getAttribute('href') : null),
  );
  console.log('first submission:', firstSubLink);
  if (!firstSubLink) { console.log('no submissions'); process.exit(1); }

  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, firstSubLink);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/submission-detail.png', clip: { x: 0, y: 0, width: 1600, height: 900 } });

  const probe = await page.evaluate(() => {
    const tree = document.querySelector('[data-testid="file-tree"]');
    const codeWrap = document.querySelector('[data-testid="submission-code-viewer"]');
    const codeEl = codeWrap?.querySelector('pre code');
    const hasHighlight = codeEl
      ? Array.from(codeEl.querySelectorAll('span')).some((s) => s.className.includes('text-'))
      : false;
    return {
      treeVisible: !!tree,
      codeViewerPresent: !!codeWrap,
      hasHighlight,
      codeSample: codeEl ? (codeEl.textContent || '').slice(0, 150) : null,
    };
  });
  console.log('tree visible (should be false for single file):', probe.treeVisible);
  console.log('code viewer present:', probe.codeViewerPresent);
  console.log('syntax highlighting active:', probe.hasHighlight);
  console.log('code sample:', probe.codeSample);
  await browser.close();
})();
