/**
 * Take a screenshot of the dev page exactly as a host browser sees it
 * (i.e. through the published port 5174, not the in-container 5173).
 * Run inside plaglens-frontend-dev container — `host.docker.internal`
 * resolves to the Windows host IP (Docker Desktop magic).
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const responses = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      errors.push(`[${m.type()}] ` + m.text());
    }
  });
  page.on('response', (r) =>
    responses.push({ url: r.url(), status: r.status(), ct: r.headers()['content-type'] || '' }),
  );
  // Default goes straight to the in-container Vite (no docker-port-map indirection,
  // and the Host header matches what a user browser sends to localhost:5174).
  const target = process.argv[2] || 'http://localhost:5173/login';
  console.log('TARGET:', target);
  try {
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('GOTO FAILED:', e.message);
  }
  await page.screenshot({ path: '/tmp/dev-screenshot.png', fullPage: true });
  const fontSize = await page.evaluate(() => getComputedStyle(document.body).fontSize);
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  const stylesheets = await page.evaluate(() => document.styleSheets.length);
  const html = await page.content();
  console.log('\n=== ERRORS ===');
  errors.forEach((e) => console.log(' • ' + e));
  if (!errors.length) console.log(' (none)');
  console.log('\n=== STATE ===');
  console.log('stylesheets:', stylesheets);
  console.log('body fontSize:', fontSize);
  console.log('body fontFamily:', fontFamily);
  console.log('html length:', html.length);
  console.log('\n=== TOP NON-200 / .css RESPONSES ===');
  responses
    .filter((r) => r.status !== 200 || /\.(css)/.test(r.url))
    .slice(0, 10)
    .forEach((r) => console.log(`  ${r.status}  ${r.url}`));
  console.log('\nscreenshot saved to /tmp/dev-screenshot.png');
  await browser.close();
})();
