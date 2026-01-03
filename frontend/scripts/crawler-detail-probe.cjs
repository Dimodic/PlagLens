/**
 * Detail-page probe: after login, visit a single detail page sampled from
 * the list endpoints. Reports any 404 / API >= 400 / pageerror.
 *
 * Used as a follow-up to crawler-404.cjs to verify that detail-pages reachable
 * via JS handlers (not <a href>) also work end-to-end.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:5173';
const NAV_TIMEOUT_MS = 30000;
const SETTLE_MS = 1500;

// For each role we list explicit detail URLs to try. Slugs/IDs come from the
// seed data the user has running (knad-cpp-24-25, ic_dd07ea540efe0f, etc).
const PROBES = {
  admin: {
    btn: 'demo-login-admin',
    pages: [
      // user detail (will be discovered after listing users)
      '/admin/users:first',
      '/admin/tenants/tnt_d1aa47aacb4a47a2b5c989c9',
    ],
  },
  teacher: {
    btn: 'demo-login-teacher',
    pages: [
      '/courses/knad-cpp-24-25',
      '/courses/knad-cpp-24-25/members',
      '/courses/knad-cpp-24-25/groups',
      '/courses/knad-cpp-24-25/invitations',
      '/courses/knad-cpp-24-25/stats',
      '/integrations/ic_dd07ea540efe0f',
    ],
  },
  student: {
    btn: 'demo-login-student1',
    pages: [
      '/me/assignments:first',
      '/me/submissions:first',
    ],
  },
};

async function fetchFirstId(page, path, field = 'id') {
  // Use the SPA's already-authenticated fetch (cookies set, auth header in client).
  return await page.evaluate(
    async ({ p, f }) => {
      try {
        const r = await window.fetch(p, { credentials: 'include' });
        if (!r.ok) return null;
        const j = await r.json();
        const data = Array.isArray(j) ? j : j.data;
        if (!Array.isArray(data) || data.length === 0) return null;
        return data[0][f] ?? data[0].slug ?? null;
      } catch {
        return null;
      }
    },
    { p: path, f: field },
  );
}

async function probeRole(roleKey, info) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = [];
  let currentUrl = '/';
  let recording = false;

  page.on('response', async (resp) => {
    try {
      if (!recording) return;
      const url = resp.url();
      const status = resp.status();
      if (status < 400) return;
      if (!url.includes('/api/')) return;
      if (url.includes('/api/v1/auth/refresh') && status === 401) return;
      if (url.includes('/api/v1/auth/me') && status === 401) return;
      findings.push({
        role: roleKey,
        url: currentUrl,
        kind: `api_${status}`,
        detail: `${resp.request().method()} ${new URL(url).pathname} → ${status}`,
      });
    } catch {
      /* noop */
    }
  });
  page.on('pageerror', (err) => {
    if (!recording) return;
    findings.push({
      role: roleKey,
      url: currentUrl,
      kind: 'pageerror',
      detail: String(err && err.message ? err.message : err).slice(0, 300),
    });
  });

  await page.goto(`${BASE}/demo`, { timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector(`[data-testid="${info.btn}"]`, { timeout: NAV_TIMEOUT_MS });
  await page.click(`[data-testid="${info.btn}"]`);
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: NAV_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);

  for (const pageTpl of info.pages) {
    let url = pageTpl;
    if (pageTpl.endsWith(':first')) {
      const listPath = pageTpl.replace(':first', '');
      let apiPath;
      let urlPrefix;
      if (listPath === '/admin/users') {
        apiPath = '/api/v1/users';
        urlPrefix = '/admin/users';
      } else if (listPath === '/me/assignments') {
        apiPath = '/api/v1/users/me/assignments';
        urlPrefix = '/me/assignments';
      } else if (listPath === '/me/submissions') {
        apiPath = '/api/v1/users/me/submissions';
        urlPrefix = '/me/submissions';
      } else {
        process.stdout.write(`  ? unknown :first template: ${pageTpl}\n`);
        continue;
      }
      const id = await fetchFirstId(page, apiPath);
      if (!id) {
        process.stdout.write(`  ? no data for ${listPath} — skipping detail probe\n`);
        continue;
      }
      url = `${urlPrefix}/${id}`;
    }

    recording = false;
    currentUrl = url;
    try {
      await page.evaluate((target) => {
        window.history.pushState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, url);
    } catch (e) {
      findings.push({
        role: roleKey,
        url,
        kind: 'nav_error',
        detail: String(e).slice(0, 200),
      });
      continue;
    }

    await page.waitForTimeout(400);
    recording = true;

    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      /* noop */
    }
    await page.waitForTimeout(SETTLE_MS);

    let is404 = false;
    try {
      const title = await page.title();
      if (title.includes('Не найдена') || title.includes('Not Found')) is404 = true;
    } catch {
      /* noop */
    }
    if (!is404) {
      try {
        is404 = await page.evaluate(() => {
          const h1s = Array.from(document.querySelectorAll('h1'));
          return h1s.some((h) => h.textContent && h.textContent.trim() === '404');
        });
      } catch {
        /* noop */
      }
    }
    if (is404) {
      findings.push({ role: roleKey, url, kind: '404', detail: 'NotFoundPage rendered' });
    }
    process.stdout.write(`  visited ${url} (findings so far: ${findings.length})\n`);
  }

  await browser.close();
  return { role: roleKey, findings };
}

(async () => {
  for (const [roleKey, info] of Object.entries(PROBES)) {
    process.stdout.write(`\n=== Detail probe as ${roleKey} ===\n`);
    try {
      const r = await probeRole(roleKey, info);
      process.stdout.write(`[${roleKey}] findings=${r.findings.length}\n`);
      for (const f of r.findings) {
        process.stdout.write(`  [${f.kind}] ${f.url}: ${f.detail}\n`);
      }
    } catch (e) {
      process.stdout.write(`[${roleKey}] PROBE FAILED: ${e}\n`);
    }
  }
})();
