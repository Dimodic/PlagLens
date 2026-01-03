/* Width probe — detects pages whose content stretches edge-to-edge on a wide
 * viewport because they forgot the <Page width="..."> container.
 *
 * Runs at 1920×1080 so a missing max-width is visible (rail 64 + drawer 0 +
 * padding ~24 → content area is ~1830px wide if no <Page>). With <Page>:
 *   narrow:   max-w-[760px]  → ~760px wide
 *   regular:  max-w-[1080px] → ~1080px wide
 *   wide:     max-w-[1440px] → ~1440px wide
 *
 * For each role: open every sidebar landing + every reachable sub-route from
 * the routes config, screenshot, and capture content-width metrics.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/width-probe';
const BASE = 'http://127.0.0.1:5173';
const VIEWPORT = { width: 1920, height: 1080 };

// Comprehensive route list — gathered from frontend/src/routes/index.tsx.
// Anything that's a sub-route under a Detail page (course/assignment/...) is
// reached via its parent's first item, so we skip those here; the parent's
// own Page would cover them anyway.
const ROUTES = {
  teacher: {
    testId: 'teacher',
    paths: [
      // sidebar landings
      '/courses', '/me/assignments', '/me/submissions', '/reports', '/imports',
      '/integrations', '/settings',
      // teacher-accessible second-level
      '/me', '/me/settings', '/me/profile', '/me/security', '/me/api-keys',
      '/me/external-bindings', '/me/2fa', '/me/grades', '/me/exports',
      '/me/notifications/preferences', '/me/notifications/web-push',
      '/notifications',
      '/courses/new', '/courses/join',
      '/integrations/wizard', '/integrations/new',
      '/integrations/yandex-contest/setup',
      '/integrations/stepik/setup',
      '/integrations/ejudge/setup',
    ],
  },
  admin: {
    testId: 'admin',
    paths: [
      // admin sidebar
      '/', '/admin', '/admin/overview', '/admin/users', '/admin/audit',
      '/admin/roles', '/admin/integrations', '/admin/notifications/email',
      '/admin/ai/providers', '/admin/system/settings', '/admin/system/health',
      // sub-pages
      '/admin/users/new', '/admin/integrations/new',
      '/admin/integrations/oauth-providers', '/admin/integrations/webhooks',
      '/admin/audit/search', '/admin/audit/access-denied',
      '/admin/audit/retention', '/admin/audit/legal-holds',
      '/admin/notifications/templates', '/admin/notifications/deliveries',
      '/admin/notifications/dlq',
      '/admin/ai/budgets', '/admin/ai/cache', '/admin/ai/prompt-versions',
      '/admin/exports', '/admin/plagiarism-corpus',
      '/admin/providers', '/admin/metrics',
      '/admin/tenants', '/admin/tenants/new',
      '/me/profile', '/me/settings', '/notifications',
    ],
  },
  student: {
    testId: 'student1',
    paths: [
      '/', '/me', '/me/assignments', '/me/submissions', '/me/grades',
      '/me/settings', '/me/profile', '/me/security', '/me/api-keys',
      '/me/external-bindings', '/me/2fa', '/me/exports',
      '/me/notifications/preferences', '/me/notifications/web-push',
      '/notifications',
    ],
  },
};

const MAX_REASONABLE_WIDTH = 1500; // anything wider than max-w-[1440px] is suspect

async function spaNav(page, url) {
  try {
    await page.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, url);
  } catch {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await page.waitForTimeout(900);
}

async function probeRole(browser, roleName, conf, results) {
  console.log(`\n=== ${roleName} ===`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  try {
    await page.click(`[data-testid="demo-login-${conf.testId}"]`, { timeout: 6000 });
  } catch {
    console.log('  ! login failed');
    await ctx.close();
    return;
  }
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  for (const url of conf.paths) {
    await spaNav(page, url);
    const finalUrl = new URL(page.url()).pathname;
    const m = await page.evaluate(() => {
      // Find the H1 + its closest container; measure inner content width.
      const main = document.querySelector('[data-testid="app-main"]');
      const pageEl = document.querySelector('[data-page-width]');
      const mainWidth = main ? main.getBoundingClientRect().width : null;
      const pageMode = pageEl ? pageEl.getAttribute('data-page-width') : null;
      const pageWidth = pageEl ? pageEl.getBoundingClientRect().width : null;
      // Auth pages have their own full-screen layout — detect by no app-main.
      const isFullScreen = !main;
      // Try to detect H1 content x-offset & width as a sanity check
      const h1 = document.querySelector('h1');
      let h1Right = null;
      if (h1) {
        const r = h1.getBoundingClientRect();
        h1Right = Math.round(r.right);
      }
      return {
        mainWidth: mainWidth ? Math.round(mainWidth) : null,
        pageMode,
        pageWidth: pageWidth ? Math.round(pageWidth) : null,
        isFullScreen,
        h1Right,
      };
    });
    // Build flags
    const noPage = !m.isFullScreen && m.pageMode == null;
    const tooWide = !m.isFullScreen && (m.pageWidth ?? m.mainWidth ?? 0) > MAX_REASONABLE_WIDTH;
    const flags = [];
    if (noPage) flags.push('NO-PAGE');
    if (tooWide) flags.push('TOO-WIDE');
    const status = flags.length ? '✗ ' + flags.join('+') : '✓';
    const w = m.pageWidth ?? m.mainWidth ?? '-';
    console.log(`  ${status.padEnd(18)} ${url.padEnd(40)} → ${finalUrl.padEnd(28)} pageMode=${(m.pageMode ?? '-').padEnd(7)} w=${w}`);
    results.pages.push({
      role: roleName,
      requested: url,
      finalUrl,
      noPage,
      tooWide,
      pageMode: m.pageMode,
      pageWidth: m.pageWidth,
      mainWidth: m.mainWidth,
      isFullScreen: m.isFullScreen,
    });
    // Screenshot for visual review
    const slug = url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
    if (noPage || tooWide) {
      await page.screenshot({
        path: `${OUT_DIR}/${roleName}-${slug}.png`,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: 700 },
      });
    }
  }
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const results = { pages: [] };
  for (const [role, conf] of Object.entries(ROUTES)) {
    try { await probeRole(browser, role, conf, results); }
    catch (e) { console.log(`!! ${role}: ${e.message}`); }
  }
  await browser.close();

  const broken = results.pages.filter((p) => p.noPage || p.tooWide);
  console.log(`\n========== SUMMARY ==========`);
  console.log(`  pages visited: ${results.pages.length}`);
  console.log(`  broken (no <Page> or too wide): ${broken.length}`);
  for (const b of broken) {
    const flags = [b.noPage && 'NO-PAGE', b.tooWide && 'TOO-WIDE'].filter(Boolean).join('+');
    console.log(`    [${b.role}] ${b.requested}  → ${b.finalUrl}  ${flags}  w=${b.pageWidth ?? b.mainWidth}`);
  }
  fs.writeFileSync(`${OUT_DIR}/_report.json`, JSON.stringify(results, null, 2));
  console.log(`\n  → ${OUT_DIR}/_report.json`);
})();
