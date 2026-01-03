/* Sidebar correctness probe.
 *
 * For each role: log in, walk EVERY visible sidebar item (rail + drawer), click
 * it, and assert:
 *   1. URL after click == href of item (no silent RoleGuard redirect)
 *   2. data-active=true is set on that item after navigation (no stale active)
 *
 * Output: list of failures + JSON dump in /tmp/sidebar-probe.json
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const ROLES = [
  { id: 'teacher', testId: 'teacher' },
  { id: 'admin', testId: 'admin' },
  { id: 'student', testId: 'student1' },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const out = { roles: {} };
  for (const role of ROLES) {
    console.log(`\n=== ${role.id} ===`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(800);
    try {
      await page.click(`[data-testid="demo-login-${role.testId}"]`, { timeout: 6000 });
    } catch (e) {
      console.log('  ! login failed:', e.message);
      out.roles[role.id] = { error: e.message };
      await ctx.close();
      continue;
    }
    await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Collect every visible sidebar item once (drawer is overlay; rail is always on).
    const sidebarItems = await page.$$eval(
      '[data-testid="app-sidebar"] [data-testid^="nav-item-"]',
      (els) =>
        els.map((e) => ({
          id: (e.getAttribute('data-testid') || '').replace('nav-item-', ''),
          href: e.getAttribute('href'),
          text: (e.getAttribute('aria-label') || e.textContent || '').trim(),
        })),
    );

    const results = [];
    for (const item of sidebarItems) {
      if (!item.href) continue;
      // SPA-navigate (preserves auth state)
      await page.evaluate((u) => {
        window.history.pushState({}, '', u);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, item.href);
      await page.waitForTimeout(900);
      const urlAfter = new URL(page.url()).pathname;
      const silentRedirect = urlAfter !== item.href;
      const activeNow = await page.$$eval(
        '[data-testid^="nav-item-"][data-active="true"]',
        (els) =>
          els.map((e) => ({
            id: (e.getAttribute('data-testid') || '').replace('nav-item-', ''),
            href: e.getAttribute('href'),
          })),
      );
      const activeMatchesUrl = activeNow.length > 0 && activeNow[0].href === urlAfter;
      const itemIsActive = activeNow.some((a) => a.id === item.id);
      const passed = !silentRedirect && itemIsActive && activeMatchesUrl;
      const mark = passed ? '✓' : '✗';
      const note = [];
      if (silentRedirect) note.push(`redirect→${urlAfter}`);
      if (!itemIsActive) note.push('item-not-active');
      if (!activeMatchesUrl) note.push('active-mismatches-url');
      console.log(
        `  ${mark} ${item.id.padEnd(18)} href=${(item.href || '').padEnd(30)} ${note.join(' ') || 'ok'}`,
      );
      results.push({ item, urlAfter, silentRedirect, itemIsActive, activeMatchesUrl, passed });
    }
    const fails = results.filter((r) => !r.passed);
    console.log(`  summary: ${results.length - fails.length}/${results.length} ok, ${fails.length} failing`);
    out.roles[role.id] = { items: results, fails: fails.length };
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync('/tmp/sidebar-probe.json', JSON.stringify(out, null, 2));
  console.log('\n→ /tmp/sidebar-probe.json');
  const totalFails = Object.values(out.roles).reduce(
    (a, r) => a + (r.fails || 0),
    0,
  );
  console.log(`\nTOTAL FAILS: ${totalFails}`);
  process.exit(totalFails > 0 ? 1 : 0);
})();
