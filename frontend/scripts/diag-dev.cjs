/**
 * Headless diagnostic for the Vite dev server. Run inside the
 * plaglens-frontend-dev container:
 *   docker exec plaglens-frontend-dev node scripts/diag-dev.js
 *
 * Reports: page errors, console errors, every response status (especially
 * .css / .tsx imports), and a sniff of <link rel=stylesheet> tags actually
 * applied to the document.
 */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext();
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
  try {
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('GOTO FAILED:', e.message);
  }
  // Snapshot what actually applied to the DOM.
  const stylesheets = await page.evaluate(() =>
    Array.from(document.styleSheets).map((s) => ({
      href: s.href,
      rules: (() => {
        try {
          return s.cssRules ? s.cssRules.length : -1;
        } catch (_) {
          return 'CORS-blocked';
        }
      })(),
    })),
  );
  const bodyClass = await page.evaluate(() => document.body.className);
  const computedFontFamily = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  );
  console.log('=== ERRORS ===');
  errors.forEach((e) => console.log(' • ' + e));
  if (!errors.length) console.log(' (none)');

  console.log('\n=== CSS / TS RESPONSES (failures + non-200) ===');
  responses
    .filter((r) => r.status !== 200 || /\.(css|tsx|ts)$/.test(r.url))
    .slice(0, 25)
    .forEach((r) => console.log(`  ${r.status}  ${r.ct.slice(0, 30).padEnd(30)}  ${r.url}`));

  console.log('\n=== STYLESHEETS APPLIED ===');
  stylesheets.forEach((s) => console.log(' •', s));
  console.log('\nbody.className:', bodyClass);
  console.log('body fontFamily:', computedFontFamily);

  await browser.close();
})();
