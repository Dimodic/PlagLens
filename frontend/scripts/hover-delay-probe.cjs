/* Verify hover-drawer opens with delay (400ms), closes instantly. */
const { chromium } = require('playwright-core');

async function isDrawerVisible(page) {
  return page.$eval(
    '[data-testid="app-sidebar-drawer"]',
    (el) => {
      const cs = window.getComputedStyle(el);
      return cs.opacity !== '0' && cs.pointerEvents !== 'none';
    },
  );
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Start away from sidebar, ensure drawer closed.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(200);
  const initial = await isDrawerVisible(page);
  console.log(`initial: drawer visible=${initial} (expected false)`);

  // Hover the rail.
  await page.mouse.move(30, 400);
  // After 500ms — drawer should still be closed (user is still aiming at icon).
  await page.waitForTimeout(500);
  const after500 = await isDrawerVisible(page);
  console.log(`after 500ms hover: drawer visible=${after500} (expected false)`);

  // After total ~900ms — drawer should be open (user stayed → wants drawer).
  await page.waitForTimeout(400);
  const after900 = await isDrawerVisible(page);
  console.log(`after 900ms hover: drawer visible=${after900} (expected true)`);

  // Mouse leave — drawer should close immediately.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(100);
  const afterLeave = await isDrawerVisible(page);
  console.log(`after leave (100ms): drawer visible=${afterLeave} (expected false)`);

  const pass =
    initial === false &&
    after500 === false &&
    after900 === true &&
    afterLeave === false;
  console.log(`\n${pass ? '✓ PASS' : '✗ FAIL'} hover delay behavior`);

  await browser.close();
  process.exit(pass ? 0 : 1);
})();
