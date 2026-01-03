/**
 * BFS-style 404 hunter: log in as each demo role, walk every internal link
 * up to depth 4, and record:
 *
 *   - 404 (frontend NotFoundPage rendered)
 *   - API >= 400 (except auth/refresh 401 which is normal)
 *   - pageerror (uncaught exceptions)
 *
 * Outputs JSON to /tmp/404-findings.json so we can read it back.
 *
 * Note: sidebar groups (Audit / AI / etc) collapse by default, so we
 * pre-expand every nav-group-toggle before harvesting links.
 *
 * A fresh browser is launched per role so cookies / SW state don't bleed.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:5173';
const MAX_DEPTH = 4;
const MAX_PAGES_PER_ROLE = 150;
const NAV_TIMEOUT_MS = 30000;
const SETTLE_MS = 1500;

const ROLES = [
  { key: 'admin', btn: 'demo-login-admin' },
  { key: 'teacher', btn: 'demo-login-teacher' },
  { key: 'student', btn: 'demo-login-student1' },
];

function isVisitable(href) {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('mailto:')) return false;
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const u = new URL(href);
      return u.origin === BASE;
    } catch {
      return false;
    }
  }
  if (
    href.startsWith('/login') ||
    href.startsWith('/register') ||
    href.startsWith('/demo') ||
    href.startsWith('/auth/')
  ) {
    return false;
  }
  return href.startsWith('/');
}

function normalize(u) {
  try {
    const url = new URL(u, BASE);
    let p = url.pathname.replace(/\/+$/, '') || '/';
    return p;
  } catch {
    return u;
  }
}

function templateKey(u) {
  const norm = normalize(u);
  return norm
    .split('/')
    .map((seg) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(seg)) return ':uuid';
      if (/^[0-9a-f]{24,}$/i.test(seg)) return ':id';
      if (/^(ic|tnt|usr|sub|run|tk|ev|grp|exp|pair)_[0-9a-f]+$/i.test(seg)) return ':id';
      return seg;
    })
    .join('/');
}

async function expandAllGroups(page) {
  try {
    const toggles = await page.$$('[data-testid^="nav-group-toggle-"]');
    for (const t of toggles) {
      try {
        const expanded = await t.getAttribute('aria-expanded');
        if (expanded === 'false') {
          await t.click({ timeout: 1000 });
        }
      } catch {
        /* noop */
      }
    }
  } catch {
    /* noop */
  }
}

async function crawlRole(role) {
  // Fresh browser per role so cookies/storage don't bleed.
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = [];
  const visited = new Set();
  const visitedTemplates = new Set();
  const queue = [];

  // We use a per-visit window of "expected API calls", flushed each navigation.
  // The buffer keeps (status, url) for the *currently-visited* page only.
  let currentUrl = '/';
  let recording = false; // pause recording during teardown / login

  page.on('response', async (resp) => {
    try {
      if (!recording) return;
      const url = resp.url();
      const status = resp.status();
      if (status < 400) return;
      if (!url.includes('/api/')) return;
      if (url.includes('/api/v1/auth/refresh') && status === 401) return;
      // Some pages call /me which can 401 if we navigate during token swap.
      if (url.includes('/api/v1/auth/me') && status === 401) return;
      findings.push({
        role: role.key,
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
      role: role.key,
      url: currentUrl,
      kind: 'pageerror',
      detail: String(err && err.message ? err.message : err).slice(0, 300),
    });
  });

  await page.goto(`${BASE}/demo`, { timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector(`[data-testid="${role.btn}"]`, { timeout: NAV_TIMEOUT_MS });
  await page.click(`[data-testid="${role.btn}"]`);
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: NAV_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);

  recording = true;

  const landingPath = new URL(page.url()).pathname;
  queue.push({ url: normalize(landingPath), depth: 0 });

  const seeds = {
    admin: [
      '/admin/overview',
      '/admin/users',
      '/admin/tenants',
      '/admin/roles',
      '/admin/audit',
      '/admin/audit/search',
      '/admin/audit/access-denied',
      '/admin/audit/retention',
      '/admin/audit/legal-holds',
      '/admin/integrations',
      '/admin/integrations/oauth-providers',
      '/admin/integrations/webhooks',
      '/admin/notifications/email',
      '/admin/notifications/templates',
      '/admin/notifications/deliveries',
      '/admin/notifications/dlq',
      '/admin/ai/providers',
      '/admin/ai/prompt-versions',
      '/admin/ai/budgets',
      '/admin/ai/cache',
      '/admin/system/settings',
      '/admin/system/health',
      '/admin/metrics',
      '/admin/providers',
      '/admin/plagiarism-corpus',
      '/admin/exports',
      '/admin/dashboard/global',
      '/notifications',
      '/me',
      '/me/profile',
      '/me/security',
      '/me/api-keys',
      '/me/external-bindings',
      '/me/2fa',
      '/me/settings',
      '/me/notifications/preferences',
      '/me/notifications/web-push',
    ],
    teacher: [
      '/courses',
      '/me/assignments',
      '/me/submissions',
      '/reports',
      '/imports',
      '/integrations',
      '/integrations/wizard',
      '/integrations/new',
      '/notifications',
      '/settings',
      '/me',
      '/me/profile',
      '/me/security',
      '/me/api-keys',
      '/me/external-bindings',
      '/me/2fa',
      '/me/settings',
      '/me/exports',
      '/me/notifications/preferences',
      '/me/notifications/web-push',
    ],
    student: [
      '/me',
      '/me/assignments',
      '/me/submissions',
      '/me/grades',
      '/me/settings',
      '/me/profile',
      '/me/security',
      '/me/api-keys',
      '/me/external-bindings',
      '/me/2fa',
      '/me/exports',
      '/notifications',
      '/me/notifications/preferences',
      '/me/notifications/web-push',
    ],
  };
  for (const s of seeds[role.key] || []) {
    queue.push({ url: normalize(s), depth: 1 });
  }

  while (queue.length > 0 && visited.size < MAX_PAGES_PER_ROLE) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    const tkey = templateKey(url);
    if (visitedTemplates.has(tkey)) continue;
    visited.add(url);
    visitedTemplates.add(tkey);

    // Pause recording while we change URL so the in-flight requests of the
    // OLD page don't get blamed on the NEW one.
    recording = false;
    currentUrl = url;

    try {
      await page.evaluate((target) => {
        window.history.pushState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, url);
    } catch (e) {
      findings.push({
        role: role.key,
        url,
        kind: 'nav_error',
        detail: String(e).slice(0, 200),
      });
      continue;
    }

    // Let the old in-flight requests drain + the new page mount.
    await page.waitForTimeout(400);
    recording = true;

    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      /* noop */
    }
    await page.waitForTimeout(SETTLE_MS);

    await expandAllGroups(page);

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
      findings.push({ role: role.key, url, kind: '404', detail: 'NotFoundPage rendered' });
    }

    let hrefs = [];
    try {
      hrefs = await page.evaluate(() => {
        const out = new Set();
        document.querySelectorAll('a[href]').forEach((a) => {
          const h = a.getAttribute('href');
          if (h) out.add(h);
        });
        return Array.from(out);
      });
    } catch {
      /* noop */
    }

    if (depth < MAX_DEPTH) {
      for (const raw of hrefs) {
        if (!isVisitable(raw)) continue;
        const norm = normalize(raw);
        if (visited.has(norm)) continue;
        if (visitedTemplates.has(templateKey(norm))) continue;
        queue.push({ url: norm, depth: depth + 1 });
      }
    }
  }

  await browser.close();
  return { role: role.key, visited: Array.from(visited).sort(), findings };
}

(async () => {
  const out = {};
  for (const role of ROLES) {
    process.stdout.write(`\n=== Crawling as ${role.key} ===\n`);
    try {
      const result = await crawlRole(role);
      out[role.key] = result;
      process.stdout.write(
        `[${role.key}] visited=${result.visited.length} findings=${result.findings.length}\n`,
      );
      for (const f of result.findings) {
        process.stdout.write(`  [${f.kind}] ${f.url}: ${f.detail}\n`);
      }
    } catch (e) {
      process.stdout.write(`[${role.key}] CRAWL FAILED: ${e}\n`);
      out[role.key] = { role: role.key, error: String(e) };
    }
  }
  require('fs').writeFileSync('/tmp/404-findings.json', JSON.stringify(out, null, 2));
  process.stdout.write('\nWrote /tmp/404-findings.json\n');
})();
