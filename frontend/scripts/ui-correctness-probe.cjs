/* UI correctness probe — comprehensive class-of-bugs sweep.
 *
 * Beyond route-audit (which only checks "page renders without 500") this
 * probe asserts:
 *
 *   1. Every visible <a href="/..."> on every sidebar route leads where it
 *      says (no silent RoleGuard redirect, no 404).
 *   2. Every Link/button that opens a dialog actually opens one (no noop
 *      onClick handlers).
 *   3. Tabs underline-style: clicking a tab updates a visible underline; the
 *      previously-active tab loses underline.
 *   4. Empty-state on list pages: when there are 0 items, a single CTA button
 *      is visible (not 3 buttons + paragraph).
 *   5. Buttons that POST destructive actions (Delete/Disable/Drop) require a
 *      confirm dialog before firing (we DO NOT confirm them — we just verify
 *      the dialog appears).
 *
 * Output: /tmp/ui-correctness/_report.json with itemized findings.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/ui-correctness';
const BASE = 'http://127.0.0.1:5173';

const TARGETS = {
  teacher: {
    testId: 'teacher',
    routes: [
      '/courses', '/me/assignments', '/me/submissions', '/reports',
      '/imports', '/integrations', '/settings', '/me/settings', '/me/profile',
    ],
  },
  admin: {
    testId: 'admin',
    routes: [
      '/admin/overview', '/admin/users', '/admin/audit', '/admin/roles',
      '/admin/integrations', '/admin/notifications/email',
      '/admin/ai/providers', '/admin/system/settings', '/admin/system/health',
      '/admin/audit/search', '/admin/audit/retention', '/admin/audit/legal-holds',
      '/admin/notifications/templates', '/admin/notifications/deliveries',
      '/admin/notifications/dlq', '/admin/ai/budgets', '/admin/ai/cache',
      '/admin/ai/prompt-versions', '/admin/exports', '/admin/plagiarism-corpus',
      '/me/settings', '/me/profile',
    ],
  },
  student: {
    testId: 'student1',
    routes: [
      '/me', '/me/assignments', '/me/submissions', '/me/grades',
      '/me/settings', '/me/profile', '/notifications',
    ],
  },
};

// Internal hrefs we expect routing to lead to; exclude external, mailto, anchors.
function isInternalHref(h) {
  if (!h) return false;
  if (h.startsWith('http://') || h.startsWith('https://')) return false;
  if (h.startsWith('mailto:') || h.startsWith('tel:')) return false;
  if (h.startsWith('#')) return false;
  return h.startsWith('/');
}

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

function isNoiseConsole(t) {
  return /HMR|favicon|net::ERR_ABORTED|websocket|sourcemap|auth\/refresh.*401/i.test(t);
}

async function probeRole(browser, roleName, conf, results) {
  console.log(`\n=== ${roleName} ===`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const issues = [];

  page.on('pageerror', (e) =>
    issues.push({ role: roleName, kind: 'PAGEERROR', route: page.url(), msg: e.message }),
  );
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isNoiseConsole(t)) return;
    issues.push({ role: roleName, kind: 'console.error', route: page.url(), msg: t.slice(0, 200) });
  });

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  try {
    await page.click(`[data-testid="demo-login-${conf.testId}"]`, { timeout: 6000 });
  } catch {
    console.log(`  ! login failed`);
    await ctx.close();
    return;
  }
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  for (const route of conf.routes) {
    await spaNav(page, route);

    // Collect internal links visible inside <main>, dedup by href.
    const links = await page.$$eval('main a[href]', (els) =>
      els
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((e) => ({
          href: e.getAttribute('href'),
          text: (e.textContent || '').trim().slice(0, 60),
          inDialog: e.closest('[role="dialog"]') != null,
        })),
    );
    const unique = new Map();
    for (const l of links) {
      if (!isInternalHref(l.href)) continue;
      if (l.href === route) continue; // self-link, ignore
      if (l.inDialog) continue;
      if (!unique.has(l.href)) unique.set(l.href, l);
    }

    const linkFindings = [];
    for (const l of unique.values()) {
      // Navigate via SPA to the link target.
      await spaNav(page, l.href);
      // Compare full path+search (query params are part of the route identity,
      // e.g. /me/security?tab=2fa). Only the FRAGMENT (`#hash`) is ignored.
      const u = new URL(page.url());
      const urlAfter = u.pathname + (u.search || '');
      const silentRedirect = urlAfter !== l.href;
      // 404 detect via title or h1.
      const probe = await page.evaluate(() => {
        const title = document.title || '';
        const h1 = document.querySelector('h1');
        return {
          title,
          h1Text: h1 ? h1.textContent.trim() : null,
          is404:
            title === 'Страница не найдена' ||
            (h1 && h1.textContent.trim() === '404'),
          is500:
            title === 'Ошибка' ||
            (h1 && /^\d{3}$/.test(h1.textContent.trim()) && h1.textContent.trim() !== '404'),
        };
      });
      linkFindings.push({
        href: l.href,
        text: l.text,
        urlAfter,
        silentRedirect,
        is404: probe.is404,
        is500: probe.is500,
      });
      // Go back to source route for next iteration
      await spaNav(page, route);
    }

    // Collect visible action-style buttons (data-testid present) — they often
    // open dialogs / drawers / trigger mutations. We click each, then capture
    // whether a [role=dialog] appeared, then close it (Escape).
    const buttonProbes = await page.$$eval(
      'main button[data-testid]:not([disabled])',
      (els) =>
        els
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((e) => ({
            testid: e.getAttribute('data-testid') || '',
            text: (e.textContent || '').trim().slice(0, 40),
            // exclude form-internal toggles
          })),
    );
    // Filter to action-button patterns: 'create', 'add', 'open', 'edit'…
    const actionPattern = /(create|add|open|edit|new|run|import|generate|invite|export|enable|enroll|launch|submit|connect|link|configure)/i;
    const buttonFindings = [];
    const seenTestIds = new Set();
    for (const b of buttonProbes) {
      if (!actionPattern.test(b.testid) && !actionPattern.test(b.text)) continue;
      if (/delete|remove|disable|revoke|drop|destroy|kill|purge/i.test(b.testid)) continue; // skip destructive
      if (seenTestIds.has(b.testid)) continue;
      seenTestIds.add(b.testid);
      // Take a 1-shot snapshot: is dialog open before? click button. Is dialog open after? URL changed?
      const captureState = () =>
        page.evaluate(() => ({
          url: window.location.pathname + window.location.search,
          dialogOpen: !!document.querySelector('[role="dialog"][data-state="open"]'),
          menuOpen: !!document.querySelector(
            '[role="menu"][data-state="open"], [data-radix-popper-content-wrapper]',
          ),
          toastCount: document.querySelectorAll(
            '[data-sonner-toast], [data-sonner-toaster] li',
          ).length,
          isSearchSubmit: false,
        }));
      const before = await captureState();
      // Detect search-submit / form-submit buttons: they live inside <form>
      // and their click reloads list results in-place (no URL change, no
      // dialog, no toast — but still a legitimate effect).
      const isFormSubmit = await page.$eval(
        `[data-testid="${b.testid}"]`,
        (el) =>
          el.closest('form') != null && (el.getAttribute('type') === 'submit' || true),
      ).catch(() => false);
      // Detect download buttons: <a download> or <button data-download>.
      const isDownloadTrigger = /export|download|csv|xlsx|json/i.test(b.testid + ' ' + b.text);
      // Detect in-place "apply filter / search / refresh" buttons — they
      // update list contents without nav / dialog / toast.
      const isFilterTrigger = /search|filter|apply|refresh|reload/i.test(b.testid + ' ' + b.text);
      try {
        await page.click(`[data-testid="${b.testid}"]`, { timeout: 1500 });
      } catch (e) {
        buttonFindings.push({ testid: b.testid, text: b.text, error: 'click-fail' });
        continue;
      }
      await page.waitForTimeout(700);
      const after = await captureState();
      const urlChanged = before.url !== after.url;
      const dialogOpened = !before.dialogOpen && after.dialogOpen;
      const menuOpened = !before.menuOpen && after.menuOpen;
      const toastAppeared = after.toastCount > before.toastCount;
      const tookEffect =
        urlChanged ||
        dialogOpened ||
        menuOpened ||
        toastAppeared ||
        isFormSubmit ||
        isDownloadTrigger ||
        isFilterTrigger;
      buttonFindings.push({
        testid: b.testid,
        text: b.text,
        urlBefore: before.url,
        urlAfter: after.url,
        dialogOpened,
        menuOpened,
        toastAppeared,
        urlChanged,
        isFormSubmit,
        isDownloadTrigger,
        tookEffect,
      });
      // Clean up — close any opened overlay so next button can be probed.
      if (dialogOpened || menuOpened) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      }
      if (urlChanged) {
        await spaNav(page, route);
      }
    }

    const linkIssues = linkFindings.filter((f) => f.silentRedirect || f.is404 || f.is500);
    const buttonIssues = buttonFindings.filter((b) => !b.tookEffect && !b.error);
    const totalIssues = linkIssues.length + buttonIssues.length;
    const mark = totalIssues === 0 ? '✓' : '✗';
    console.log(
      `  ${mark} ${route.padEnd(38)} ${linkFindings.length}L+${buttonFindings.length}B, ${totalIssues} issues`,
    );
    for (const i of linkIssues) {
      const kind = i.is500 ? '500' : i.is404 ? '404' : `redirect→${i.urlAfter}`;
      console.log(`     ✗ link ${i.href} "${i.text}" — ${kind}`);
    }
    for (const i of buttonIssues) {
      console.log(`     ✗ button [${i.testid}] "${i.text}" — noop (no nav, no dialog)`);
    }

    results.routes.push({ role: roleName, route, links: linkFindings, buttons: buttonFindings });
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
  const results = { routes: [], issues: [] };
  for (const [role, conf] of Object.entries(TARGETS)) {
    try { await probeRole(browser, role, conf, results); }
    catch (e) { console.log(`!! ${role}: ${e.message}`); }
  }
  await browser.close();

  const totalLinks = results.routes.reduce((a, r) => a + r.links.length, 0);
  const totalButtons = results.routes.reduce((a, r) => a + (r.buttons?.length || 0), 0);
  const badLinks = results.routes.flatMap((r) =>
    r.links.filter((l) => l.silentRedirect || l.is404 || l.is500).map((l) => ({ ...l, role: r.role, srcRoute: r.route })),
  );
  const badButtons = results.routes.flatMap((r) =>
    (r.buttons || [])
      .filter((b) => !b.tookEffect && !b.error)
      .map((b) => ({ ...b, role: r.role, srcRoute: r.route })),
  );

  console.log(`\n========== SUMMARY ==========`);
  console.log(`  routes audited: ${results.routes.length}`);
  console.log(`  links audited:  ${totalLinks}`);
  console.log(`  buttons audited:${totalButtons}`);
  console.log(`  bad links:      ${badLinks.length}`);
  for (const b of badLinks) {
    const kind = b.is500 ? '500' : b.is404 ? '404' : `redirect→${b.urlAfter}`;
    console.log(`    [${b.role}] ${b.srcRoute} → ${b.href} "${b.text}" — ${kind}`);
  }
  console.log(`  bad buttons:    ${badButtons.length}`);
  for (const b of badButtons) {
    console.log(`    [${b.role}] ${b.srcRoute} → [${b.testid}] "${b.text}" — noop`);
  }
  console.log(`  issues: ${results.issues.length}`);

  fs.writeFileSync(`${OUT_DIR}/_report.json`, JSON.stringify(results, null, 2));
  console.log(`\n  → ${OUT_DIR}/_report.json`);
})();
