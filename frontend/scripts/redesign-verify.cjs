/**
 * Verify the Kaggle-style redesign.
 *
 * For each role (teacher, admin, student):
 *   1. Sign in via the /demo helper buttons (`data-testid="demo-login-<role>"`).
 *   2. Visit a set of routes and capture full-page screenshots.
 *   3. Probe the sidebar hover behaviour at 1280x900 (rail → drawer).
 *   4. Measure the main content max-width.
 *   5. Report any PAGEERROR / console.error events.
 *
 * Output → /tmp/redesign-shots/{role}-{slug}.png inside the container.
 * Copy out with `docker cp plaglens-frontend-dev:/tmp/redesign-shots
 *                          frontend/scripts/redesign-shots`.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT_DIR = '/tmp/redesign-shots';
const BASE = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 900 };

const TARGETS = {
  teacher: [
    { slug: 'home', url: '/' },
    { slug: 'courses', url: '/courses' },
    { slug: 'integrations', url: '/integrations' },
    { slug: 'imports', url: '/imports' },
    { slug: 'integrations-wizard', url: '/integrations/wizard' },
    { slug: 'settings', url: '/settings' },
    { slug: 'me-assignments', url: '/me/assignments' },
    { slug: 'me-submissions', url: '/me/submissions' },
    { slug: 'notifications', url: '/notifications' },
  ],
  admin: [
    { slug: 'home', url: '/' },
    { slug: 'admin-overview', url: '/admin/overview' },
    { slug: 'admin-users', url: '/admin/users' },
    { slug: 'admin-integrations', url: '/admin/integrations' },
    { slug: 'admin-audit', url: '/admin/audit' },
    { slug: 'admin-tenants', url: '/admin/tenants' },
  ],
  student: [
    { slug: 'home', url: '/' },
    { slug: 'me-assignments', url: '/me/assignments' },
    { slug: 'me-submissions', url: '/me/submissions' },
    { slug: 'me-grades', url: '/me/grades' },
    { slug: 'notifications', url: '/notifications' },
  ],
};

async function probeRole(browser, role, results, demoTestId) {
  console.log(`\n=== Role: ${role} ===`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const issues = [];
  page.on('pageerror', (e) =>
    issues.push({ role, route: 'global', kind: 'PAGEERROR', msg: e.message }),
  );
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Ignore obvious noise (favicon, etc.).
      if (/(favicon|net::ERR_ABORTED)/i.test(t)) return;
      issues.push({ role, route: page.url(), kind: 'console.error', msg: t });
    }
  });

  // Demo login
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' }).catch(() => {});
  try {
    await page.click(`[data-testid="demo-login-${demoTestId}"]`, {
      timeout: 5000,
    });
  } catch (e) {
    console.log(`  ! demo-login-${demoTestId} button not found:`, e.message);
  }
  // Wait for navigation away from /demo (auth + redirect).
  try {
    await page.waitForURL((u) => !u.toString().includes('/demo'), {
      timeout: 10_000,
    });
  } catch {
    /* may stay on / */
  }
  await page.waitForLoadState('networkidle').catch(() => {});

  // Capture per-route screenshots
  for (const t of TARGETS[role]) {
    await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle' }).catch(() => {});
    // Let any pending HMR / suspense settle.
    await page.waitForTimeout(400);

    const shot = `${OUT_DIR}/${role}-${t.slug}.png`;
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch (e) {
      console.log(`  ! screenshot ${t.slug} failed:`, e.message);
    }

    // Measure main width on the home / first route only — same shell everywhere.
    const mainWidth = await page
      .evaluate(() => {
        const el = document.querySelector('[data-testid="app-main"]');
        if (!el) return null;
        return el.getBoundingClientRect().width;
      })
      .catch(() => null);
    const pageContainer = await page
      .evaluate(() => {
        const el = document.querySelector('[data-page-width]');
        if (!el) return null;
        return {
          width: el.getBoundingClientRect().width,
          mode: el.getAttribute('data-page-width'),
        };
      })
      .catch(() => null);

    console.log(
      `  ${t.url.padEnd(28)}  main=${mainWidth ?? '—'}px  page=${
        pageContainer ? `${pageContainer.width}px (${pageContainer.mode})` : '—'
      }`,
    );
  }

  // Probe sidebar hover behaviour at /integrations.
  await page
    .goto(`${BASE}/integrations`, { waitUntil: 'networkidle' })
    .catch(() => {});

  // Take the rail screenshot first (no hover).
  await page.screenshot({
    path: `${OUT_DIR}/${role}-rail-collapsed.png`,
    clip: { x: 0, y: 0, width: 80, height: VIEWPORT.height },
  });

  const sidebar = page.locator('[data-testid="app-sidebar"]').first();
  if (await sidebar.count()) {
    const railBox = await sidebar.boundingBox();
    console.log(
      `  rail width: ${railBox?.width}px (expected ~64)`,
    );
    // Hover
    await sidebar.hover({ position: { x: 30, y: 200 } });
    await page.waitForTimeout(300);
    const drawerBox = await page
      .locator('[data-testid="app-sidebar-drawer"]')
      .first()
      .boundingBox();
    console.log(
      `  drawer width after hover: ${drawerBox?.width}px (expected ~256)`,
    );
    await page.screenshot({
      path: `${OUT_DIR}/${role}-rail-hover.png`,
      clip: { x: 0, y: 0, width: 300, height: VIEWPORT.height },
    });

    results.sidebar[role] = {
      rail: railBox?.width,
      drawer: drawerBox?.width,
    };
  } else {
    console.log('  ! no sidebar found (student-only mode?)');
    results.sidebar[role] = null;
  }

  results.issues.push(...issues);
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const results = { sidebar: {}, issues: [] };
  for (const role of [
    { id: 'teacher', testId: 'teacher' },
    { id: 'admin', testId: 'admin' },
    { id: 'student', testId: 'student1' },
  ]) {
    try {
      await probeRole(browser, role.id, results, role.testId);
    } catch (e) {
      console.log(`!! ${role.id} role probe failed:`, e.message);
    }
  }
  await browser.close();

  console.log('\n\n========== SUMMARY ==========');
  for (const role of Object.keys(results.sidebar)) {
    const s = results.sidebar[role];
    if (!s) {
      console.log(`  ${role}: (no sidebar)`);
    } else {
      console.log(
        `  ${role}: rail=${s.rail}px drawer-after-hover=${s.drawer}px`,
      );
    }
  }
  console.log(`\n  issues: ${results.issues.length}`);
  for (const i of results.issues.slice(0, 30)) {
    console.log(`    - [${i.kind}] ${i.role} ${i.route}: ${i.msg}`);
  }
  if (results.issues.length > 30) {
    console.log(`    … and ${results.issues.length - 30} more`);
  }
})();
