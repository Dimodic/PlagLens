/**
 * Verify Kaggle-style redesign v2.
 *
 *   1. Per role (teacher, admin, student) sign in via /demo.
 *   2. Visit dashboard / settings / list pages.
 *   3. Screenshot each + measure container widths.
 *   4. DOM-probe Wordmark text, rounded-full prevalence, sidebar hover overlay,
 *      Card absence on document pages.
 *   5. Capture console/network errors per page.
 *
 * Output → /tmp/redesign-shots-v2/ (in the dev container).
 * Copy out → docker cp plaglens-frontend-dev:/tmp/redesign-shots-v2 \
 *                       frontend/scripts/redesign-shots-v2
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/redesign-shots-v2';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const VIEWPORT = { width: 1280, height: 900 };

// "doc" = document-style page (no Card expected)
// "list" = list/grid page (Card-allowed but should be outlined)
const TARGETS = {
  teacher: [
    { slug: 'home', url: '/', kind: 'list' },
    { slug: 'me', url: '/me', kind: 'list' },
    { slug: 'courses', url: '/courses', kind: 'list' },
    { slug: 'integrations', url: '/integrations', kind: 'list' },
    { slug: 'settings', url: '/settings', kind: 'doc' },
    { slug: 'me-settings', url: '/me/settings', kind: 'doc' },
    { slug: 'me-profile', url: '/me/profile', kind: 'doc' },
    { slug: 'me-assignments', url: '/me/assignments', kind: 'list' },
    { slug: 'me-submissions', url: '/me/submissions', kind: 'list' },
    { slug: 'notifications', url: '/notifications', kind: 'list' },
  ],
  admin: [
    { slug: 'home', url: '/', kind: 'list' },
    { slug: 'admin-overview', url: '/admin/overview', kind: 'list' },
    { slug: 'admin-users', url: '/admin/users', kind: 'list' },
    { slug: 'admin-integrations', url: '/admin/integrations', kind: 'list' },
    { slug: 'admin-audit', url: '/admin/audit', kind: 'list' },
    { slug: 'admin-tenants', url: '/admin/tenants', kind: 'list' },
    { slug: 'me-profile', url: '/me/profile', kind: 'doc' },
    { slug: 'me-settings', url: '/me/settings', kind: 'doc' },
  ],
  student: [
    { slug: 'home', url: '/', kind: 'list' },
    { slug: 'me', url: '/me', kind: 'list' },
    { slug: 'me-assignments', url: '/me/assignments', kind: 'list' },
    { slug: 'me-submissions', url: '/me/submissions', kind: 'list' },
    { slug: 'me-grades', url: '/me/grades', kind: 'list' },
    { slug: 'me-settings', url: '/me/settings', kind: 'doc' },
    { slug: 'me-profile', url: '/me/profile', kind: 'doc' },
    { slug: 'notifications', url: '/notifications', kind: 'list' },
  ],
};

async function probeDom(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    const rounded = buttons.filter((b) =>
      b.className && /\brounded-full\b/.test(b.className.toString()),
    ).length;
    const totalButtons = buttons.length;

    // Card slot count on this page.
    const cards = document.querySelectorAll('[data-slot="card"]').length;

    // Wordmark text in the rail.
    const wordmarkRail = document.querySelector(
      '[data-testid="wordmark-rail"]',
    );
    const wordmarkDrawer = document.querySelector(
      '[data-testid="wordmark-drawer"]',
    );

    // Tabs underline check: a tab-trigger should have border-b-2 in class
    const tabTriggers = Array.from(
      document.querySelectorAll('[data-slot="tabs-trigger"]'),
    );
    const tabsUnderlineOk =
      tabTriggers.length === 0 ||
      tabTriggers.every((t) => /border-b-2/.test(t.className.toString()));
    const tabsNoPillBg =
      tabTriggers.length === 0 ||
      tabTriggers.every(
        (t) => !/bg-(card|muted|primary|secondary)\b/.test(t.className.toString()),
      );

    // Stats-panel presence.
    const statsPanel = document.querySelector(
      '[data-testid="stats-panel"], [data-testid="my-dashboard-kpis"]',
    );
    const statsPanelOk =
      !statsPanel ||
      (() => {
        const cs = window.getComputedStyle(statsPanel);
        return cs.display.includes('flex') && cs.borderTopWidth !== '0px';
      })();

    // PageContainer width / mode.
    const page = document.querySelector('[data-page-width]');
    const pageMode = page ? page.getAttribute('data-page-width') : null;
    const pageWidth = page ? page.getBoundingClientRect().width : null;

    return {
      buttons: { total: totalButtons, roundedFull: rounded },
      cards,
      wordmarkRailText: wordmarkRail ? wordmarkRail.textContent.trim() : null,
      wordmarkDrawerText: wordmarkDrawer ? wordmarkDrawer.textContent.trim() : null,
      tabsUnderlineOk,
      tabsNoPillBg,
      tabTriggers: tabTriggers.length,
      statsPanelOk: statsPanel ? statsPanelOk : null,
      pageMode,
      pageWidth: pageWidth ? Math.round(pageWidth) : null,
    };
  });
}

async function probeRole(browser, role, testId, results) {
  console.log(`\n=== Role: ${role} (demo-login-${testId}) ===`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const roleIssues = [];

  page.on('pageerror', (e) =>
    roleIssues.push({ kind: 'PAGEERROR', route: page.url(), msg: e.message }),
  );
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/(favicon|net::ERR_ABORTED|websocket|HMR|sourcemap)/i.test(t)) return;
    roleIssues.push({ kind: 'console.error', route: page.url(), msg: t });
  });
  page.on('response', (resp) => {
    const status = resp.status();
    if (status >= 400 && status !== 401 && status !== 403) {
      const url = resp.url();
      if (/\.(?:png|jpg|gif|svg|woff2?|css)\b/.test(url)) return;
      roleIssues.push({
        kind: `HTTP ${status}`,
        route: page.url(),
        msg: url,
      });
    }
  });

  // Demo login — wait on URL change rather than networkidle (HMR socket
  // pollution prevents the page from going idle inside the container).
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  try {
    await page.click(`[data-testid="demo-login-${testId}"]`, { timeout: 5000 });
  } catch (e) {
    console.log(`  ! demo-login-${testId} click failed:`, e.message);
    await ctx.close();
    return;
  }
  try {
    await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10_000 });
  } catch {/* */}
  await page.waitForTimeout(1500);

  for (const t of TARGETS[role]) {
    // SPA navigation via React Router. page.goto reloads the page which
    // wipes the in-memory access token; we then have to refresh and the
    // backend doesn't always rotate the refresh-cookie cleanly inside
    // headless. So push history client-side instead and let React Router
    // pick it up.
    try {
      await page.evaluate((url) => {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, t.url);
    } catch {
      // fall back to full nav
      await page.goto(`${BASE}${t.url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    // Give the page a moment to fetch its initial data and render.
    await page.waitForTimeout(1500);

    const shotPath = `${OUT_DIR}/${role}-${t.slug}.png`;
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch (e) {
      console.log(`  ! shot ${t.slug}:`, e.message);
    }
    let dom = null;
    try {
      dom = await probeDom(page);
    } catch (e) {
      console.log(`  ! dom-probe ${t.slug}:`, e.message);
    }
    const roundedRatio = dom && dom.buttons.total
      ? `${dom.buttons.roundedFull}/${dom.buttons.total}`
      : '-';
    const docCheck = t.kind === 'doc' && dom && dom.cards > 0 ? `⚠ cards=${dom.cards}` : '';
    console.log(
      `  ${t.url.padEnd(28)} mode=${dom?.pageMode ?? '-'} width=${
        dom?.pageWidth ?? '-'
      } rounded=${roundedRatio} cards=${dom?.cards ?? '-'} ${docCheck}`,
    );

    results.pages.push({ role, ...t, dom });
  }

  // Sidebar overlay test on /me — SPA nav so we keep the session.
  try {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/me');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  } catch {/* */}
  await page.waitForTimeout(1500);
  const sidebar = page.locator('[data-testid="app-sidebar"]').first();
  if (await sidebar.count()) {
    const railBox = await sidebar.boundingBox();
    const mainBoxBefore = await page
      .locator('[data-testid="app-main"]')
      .boundingBox();
    await sidebar.hover({ position: { x: 30, y: 200 } });
    await page.waitForTimeout(350);
    const drawerBox = await page
      .locator('[data-testid="app-sidebar-drawer"]')
      .first()
      .boundingBox();
    const mainBoxAfter = await page
      .locator('[data-testid="app-main"]')
      .boundingBox();
    const sidebarOverlay = {
      rail: railBox ? Math.round(railBox.width) : null,
      drawer: drawerBox ? Math.round(drawerBox.width) : null,
      mainShifted:
        mainBoxBefore && mainBoxAfter
          ? Math.abs(mainBoxBefore.x - mainBoxAfter.x) > 1
          : null,
    };
    console.log(
      `  sidebar: rail=${sidebarOverlay.rail}px drawer=${sidebarOverlay.drawer}px mainShifted=${sidebarOverlay.mainShifted}`,
    );
    await page.screenshot({
      path: `${OUT_DIR}/${role}-sidebar-hover.png`,
      clip: { x: 0, y: 0, width: 320, height: VIEWPORT.height },
    });
    results.sidebar[role] = sidebarOverlay;
  } else {
    results.sidebar[role] = null;
  }

  results.issues.push(...roleIssues.map((i) => ({ role, ...i })));
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const results = { pages: [], sidebar: {}, issues: [] };
  for (const role of [
    { id: 'teacher', testId: 'teacher' },
    { id: 'admin', testId: 'admin' },
    { id: 'student', testId: 'student1' },
  ]) {
    try {
      await probeRole(browser, role.id, role.testId, results);
    } catch (e) {
      console.log(`!! ${role.id}:`, e.message);
    }
  }
  await browser.close();

  console.log('\n\n========== SUMMARY ==========');
  for (const role of Object.keys(results.sidebar)) {
    const s = results.sidebar[role];
    if (!s) console.log(`  ${role}: no sidebar (pure student?)`);
    else
      console.log(
        `  ${role}: rail=${s.rail}px drawer=${s.drawer}px mainShifted=${s.mainShifted}`,
      );
  }
  console.log(`\n  issues: ${results.issues.length}`);
  for (const i of results.issues.slice(0, 50)) {
    console.log(`    - [${i.kind}] ${i.role} ${i.route}: ${i.msg}`);
  }

  fs.writeFileSync(
    `${OUT_DIR}/_summary.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(`\n  summary → ${OUT_DIR}/_summary.json`);
})();
