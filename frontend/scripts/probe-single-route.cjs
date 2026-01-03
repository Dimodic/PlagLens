/**
 * Visit a single route as one role, dump title, h1 text, body text length,
 * and any console errors. Quick triage helper.
 *
 * Usage:
 *   node /app/scripts/probe-single-route.cjs <role> <path>
 *
 * role ∈ admin | teacher | student
 */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';
const ROLE_BTN = { admin: 'demo-login-admin', teacher: 'demo-login-teacher', student: 'demo-login-student1' };

(async () => {
  const role = process.argv[2] || 'teacher';
  const path = process.argv[3] || '/';
  const btn = ROLE_BTN[role];
  if (!btn) throw new Error(`unknown role ${role}`);

  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const txt = m.text();
    const loc = m.location();
    if (/HMR|websocket|sourcemap|favicon|Download the React DevTools/i.test(txt)) return;
    if (/ERR_CONNECTION_REFUSED/.test(txt) && /(:5174|@vite|@react-refresh|vite\/client)/.test(loc.url || '')) return;
    if (/ERR_CONNECTION_REFUSED/.test(txt) && (loc.url || '') === '') return;
    if (/Request failed with status code 401/.test(txt)) return;
    errs.push(`${m.type().toUpperCase()} ${txt.slice(0, 250)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    const s = r.status();
    if (s >= 400 && u.includes('/api/') &&
        !(u.includes('/auth/refresh') && s === 401) &&
        !(u.includes('/auth/me') && s === 401)) {
      errs.push(`API ${s} ${r.request().method()} ${new URL(u).pathname}`);
    }
  });

  await page.goto(`${BASE}/demo`);
  await page.waitForSelector(`[data-testid="${btn}"]`);
  await page.click(`[data-testid="${btn}"]`);
  await page.waitForURL((u) => !u.toString().includes('/demo'));
  await page.waitForTimeout(2000);
  await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForTimeout(3500);

  const info = await page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll('h1, h2')).map((h) => h.textContent?.trim());
    return {
      title: document.title,
      headings: titles.slice(0, 5),
      bodyTextLen: (document.body.innerText || '').length,
      hasMain: !!document.querySelector('main, [data-testid="app-main"]'),
      bodyTextSnippet: (document.body.innerText || '').slice(0, 200),
    };
  });
  console.log(JSON.stringify({ role, path, info, errs }, null, 2));
  await browser.close();
})();
