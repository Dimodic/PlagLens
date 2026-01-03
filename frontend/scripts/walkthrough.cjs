/**
 * End-to-end visual walkthrough through the dev server (Vite, port 5173 inside
 * the container). For each role we:
 *   1. open /demo, click the demo card -> backend logs in via /api proxy
 *   2. snapshot the dashboard the role lands on
 *   3. visit a few key tabs the role can access, snapshot each
 *
 * Saves screenshots to /tmp/wt-<step>.png for `docker cp` afterwards.
 *
 * Errors and console warnings are accumulated and reported per role.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:5173';
const SHOTS = '/tmp';

const ROLES = [
  {
    key: 'admin',
    cardTestId: 'demo-card-admin',
    btnTestId: 'demo-login-admin',
    paths: ['/', '/admin/users', '/admin/integrations', '/admin/audit'],
  },
  {
    key: 'teacher',
    cardTestId: 'demo-card-teacher',
    btnTestId: 'demo-login-teacher',
    paths: ['/', '/courses', '/integrations', '/notifications'],
  },
  {
    key: 'student',
    cardTestId: 'demo-card-student1',
    btnTestId: 'demo-login-student1',
    paths: ['/', '/me/submissions', '/me/assignments'],
  },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const summary = [];

  for (const role of ROLES) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) =>
      errors.push(`PAGEERR ${role.key}: ${e.message}`),
    );
    page.on('console', (m) => {
      const t = m.type();
      if (t === 'error' || t === 'warning') {
        const txt = m.text();
        if (
          !txt.includes('React Router Future Flag') && // expected
          !txt.includes('WebSocket') // HMR ws inside container — fine
        ) {
          errors.push(`[${role.key} ${t}] ${txt}`);
        }
      }
    });
    page.on('requestfailed', (r) =>
      errors.push(`REQFAIL ${role.key}: ${r.url()} - ${r.failure()?.errorText}`),
    );
    page.on('response', async (r) => {
      const u = r.url();
      if (u.includes('/api/') && r.status() >= 400) {
        errors.push(`HTTP ${r.status()} ${role.key}: ${u}`);
      }
    });

    console.log(`\n========== ${role.key.toUpperCase()} ==========`);

    // 1. Demo page
    await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${SHOTS}/wt-${role.key}-0-demo.png`, fullPage: true });
    console.log(`  step 0: /demo  (loaded)`);

    // 2. Click "Войти" on the matching card
    try {
      await page.waitForSelector(`[data-testid="${role.btnTestId}"]`, {
        timeout: 5000,
      });
      await page.click(`[data-testid="${role.btnTestId}"]`);
    } catch (e) {
      console.log(`  click failed: ${e.message}`);
    }

    // 3. Wait for redirect away from /demo
    try {
      await page.waitForURL((u) => !u.toString().endsWith('/demo'), {
        timeout: 10000,
      });
    } catch (e) {
      const cur = page.url();
      console.log(`  redirect timeout, still at ${cur}`);
    }
    await page.waitForLoadState('networkidle').catch(() => {});

    // 4. Walk through each role-specific path
    for (let i = 0; i < role.paths.length; i++) {
      const p = role.paths[i];
      try {
        if (i === 0) {
          // already there from redirect, just settle
          await page.waitForLoadState('networkidle').catch(() => {});
        } else {
          // Use SPA-style click navigation when possible to keep the
          // in-memory access token. We use evaluate to trigger react-router
          // history.push directly via the URL bar – but page.goto forces full
          // reload. Try `page.evaluate` to use history API instead.
          await page.evaluate((path) => {
            window.history.pushState({}, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, p);
          await page.waitForLoadState('networkidle').catch(() => {});
        }
        const cookies = await ctx.cookies();
        const hasRefresh = cookies.some((c) => c.name === 'plaglens_refresh');
        const url = page.url();
        const title = await page.title();
        await page.screenshot({
          path: `${SHOTS}/wt-${role.key}-${i + 1}-${p.replace(/[^\w]+/g, '_')}.png`,
          fullPage: true,
        });
        console.log(
          `  step ${i + 1}: ${p}  ->  ${url}  [${title}]  cookie=${hasRefresh}`,
        );
      } catch (e) {
        console.log(`  step ${i + 1}: ${p}  FAILED: ${e.message}`);
      }
    }

    // collect role summary
    summary.push({ role: role.key, errors });

    await ctx.close();
  }

  console.log('\n========== SUMMARY ==========');
  for (const s of summary) {
    console.log(`\n${s.role}: ${s.errors.length} issue(s)`);
    s.errors.slice(0, 8).forEach((e) => console.log('   • ' + e));
  }

  await browser.close();
})();
