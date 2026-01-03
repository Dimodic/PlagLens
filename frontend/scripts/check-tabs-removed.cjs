const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/HMR|favicon|websocket|auth\/refresh.*401|ERR_CONNECTION_REFUSED/i.test(t)) return;
    console.log('CONSOLE.ERR:', t.slice(0, 200));
  });

  await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Pick the first live submission via the inbox so we know the id is fresh.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/me/submissions');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(2500);
  const firstSub = await page.$$eval('main a[href^="/submissions/"]', (els) =>
    els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h))[0],
  ).catch(() => null);
  console.log('first submission found in inbox:', firstSub);
  if (!firstSub) { console.log('no submissions in inbox'); process.exit(1); }
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, firstSub);
  // wait until the H1 ("Посылка vN") shows up — that means the submission
  // hook has resolved and the page is past its skeleton state
  try {
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('h1');
        return h1 && /Посылка\s+v\d+/.test(h1.textContent || '');
      },
      { timeout: 15000 },
    );
  } catch {
    console.log('!! h1 never resolved — submission likely 404 or auth issue');
  }
  await page.waitForTimeout(800);

  await page.screenshot({ path: '/tmp/submission-no-tabs.png', fullPage: true });

  const data = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-testid^="submission-section-"]'));
    const tabs = document.querySelectorAll('[data-testid^="submission-tab-"]');
    return {
      sectionCount: sections.length,
      sectionTitles: sections.map((s) => s.querySelector('h2')?.textContent ?? '(no h2)'),
      tabsStillPresent: tabs.length,
      pageTitle: document.querySelector('h1')?.textContent ?? '',
    };
  });
  console.log('h1:', data.pageTitle);
  console.log('sections rendered:', data.sectionCount);
  for (const t of data.sectionTitles) console.log('  -', t);
  console.log('old tabs still present:', data.tabsStillPresent, '(should be 0)');
  await browser.close();
})();
