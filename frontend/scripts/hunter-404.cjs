/**
 * Deep 404 / crash / API-error hunter.
 *
 * Improvements over crawler-404.cjs:
 *   - depth >= 2 from the sidebar (sidebar → page → sub-page / details)
 *   - opens first available item on dynamic list pages (courses/users/etc)
 *   - captures: 404 page, white-screen, console.error/warn, pageerror,
 *     API >= 400, pending requests > 5s
 *   - filters known noise (HMR WS, /auth/refresh 401, /auth/me 401)
 *   - dedup by template key (UUIDs / hex ids collapsed)
 *
 * Output: /tmp/404-hunt.json (visited + findings per role).
 * Run inside dev container so playwright-core's bundled chromium is available:
 *   docker exec plaglens-frontend-dev node /app/scripts/hunter-404.cjs
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const BASE = 'http://127.0.0.1:5173';
const MAX_PAGES_PER_ROLE = 200;
const NAV_TIMEOUT_MS = 30000;
const SETTLE_MS = 1800;
const PENDING_WARN_MS = 5000;

const ROLES = [
  { key: 'admin', btn: 'demo-login-admin' },
  { key: 'teacher', btn: 'demo-login-teacher' },
  { key: 'student', btn: 'demo-login-student1' },
];

/* Routes seeded per role from src/routes/index.tsx + Sidebar.tsx. The
 * crawler will then discover additional internal links and `data-nav-href`
 * targets from each page (depth >= 2).
 *
 * Synthetic IDs are added so dynamic routes get visited at least once
 * even when seed data has no real rows — pages must handle "not found"
 * gracefully without crashing the SPA. */
const SYNTH_ID = 'sub_synth_test_id_00000001';
const SYNTH_USR = 'usr_synth_test_id_00000001';
const SYNTH_TNT = 'tnt_synth_test_id_00000001';
const SYNTH_RUN = 'run_synth_test_id_00000001';
const SYNTH_PAIR = 'pair_synth_test_id_00000001';
const SYNTH_INT = 'ic_synth_test_id_00000001';
const SYNTH_SLUG = 'synthetic-course-slug';
const SYNTH_HW = 'synthetic-hw-slug';
const SYNTH_ASN = 'asn_synth_test_id_00000001';
const SEEDS = {
  admin: [
    '/', '/admin', '/admin/overview',
    '/admin/users', '/admin/users/new',
    '/admin/tenants', '/admin/tenants/new',
    '/admin/roles',
    '/admin/audit', '/admin/audit/search', '/admin/audit/access-denied',
    '/admin/audit/retention', '/admin/audit/legal-holds',
    '/admin/integrations', '/admin/integrations/new',
    '/admin/integrations/oauth-providers', '/admin/integrations/webhooks',
    '/admin/notifications/email', '/admin/notifications/templates',
    '/admin/notifications/deliveries', '/admin/notifications/dlq',
    '/admin/ai/providers', '/admin/ai/prompt-versions',
    '/admin/ai/budgets', '/admin/ai/cache',
    '/admin/system/settings', '/admin/system/health',
    '/admin/metrics', '/admin/providers',
    '/admin/plagiarism-corpus',
    '/admin/exports', '/admin/dashboard/global', '/admin/settings',
    '/notifications',
    '/me', '/me/profile', '/me/security', '/me/api-keys',
    '/me/external-bindings', '/me/2fa', '/me/settings',
    '/me/notifications/preferences', '/me/notifications/web-push',
    '/me/exports', '/me/assignments', '/me/submissions', '/me/grades',
    '/me/inbox',
    '/settings', '/courses', '/integrations',
    // Dynamic routes — visit with synthetic IDs so the page mounts.
    `/admin/users/${SYNTH_USR}`,
    `/admin/tenants/${SYNTH_TNT}`,
    `/admin/audit/actors/${SYNTH_USR}`,
    `/admin/audit/resources/submission/${SYNTH_ID}`,
    `/admin/integrations/${SYNTH_INT}`,
    `/admin/dashboard/tenant/${SYNTH_TNT}`,
    `/submissions/${SYNTH_ID}`,
    `/me/submissions/${SYNTH_ID}`,
    `/me/assignments/${SYNTH_ASN}`,
    `/assignments/${SYNTH_ASN}`,
    `/assignments/${SYNTH_ASN}/settings`,
    `/assignments/${SYNTH_ASN}/submissions`,
    `/assignments/${SYNTH_ASN}/deadlines`,
    `/assignments/${SYNTH_ASN}/upload`,
    `/assignments/${SYNTH_ASN}/plagiarism`,
    `/assignments/${SYNTH_ASN}/ai-analyses`,
    `/submissions/${SYNTH_ID}/ai-report`,
    `/plagiarism-runs/${SYNTH_RUN}`,
    `/plagiarism-runs/${SYNTH_RUN}/pairs/${SYNTH_PAIR}`,
    `/courses/${SYNTH_SLUG}`,
    `/courses/${SYNTH_SLUG}/settings`,
    `/courses/${SYNTH_SLUG}/members`,
    `/courses/${SYNTH_SLUG}/groups`,
    `/courses/${SYNTH_SLUG}/invitations`,
    `/courses/${SYNTH_SLUG}/stats`,
    `/courses/${SYNTH_SLUG}/dashboard`,
    `/courses/${SYNTH_SLUG}/exports`,
    `/courses/${SYNTH_SLUG}/scheduled-exports`,
    `/courses/${SYNTH_SLUG}/google-sheets`,
    `/courses/${SYNTH_SLUG}/suspicious`,
    `/courses/${SYNTH_SLUG}/homeworks/new`,
    `/courses/${SYNTH_SLUG}/homeworks/${SYNTH_HW}`,
    `/courses/${SYNTH_SLUG}/homeworks/${SYNTH_HW}/assignments/new`,
    `/courses/${SYNTH_SLUG}/assignments/new`,
    `/integrations/${SYNTH_INT}`,
    `/integrations/yandex-contest/${SYNTH_INT}/contests`,
    `/courses/join/some-code-1234`,
  ],
  teacher: [
    '/', '/courses', '/courses/new', '/courses/join',
    '/me/assignments', '/me/submissions', '/me/grades',
    '/reports', '/imports', '/grading',
    '/integrations', '/integrations/wizard', '/integrations/new',
    '/integrations/yandex-contest/setup',
    '/integrations/stepik/setup',
    '/integrations/ejudge/setup',
    '/integrations/oauth/callback',
    '/activity', '/llm',
    '/notifications', '/settings',
    '/me', '/me/profile', '/me/security', '/me/api-keys',
    '/me/external-bindings', '/me/2fa', '/me/settings',
    '/me/exports', '/me/inbox',
    '/me/notifications/preferences', '/me/notifications/web-push',
    // Dynamic with synth IDs — teacher access.
    `/submissions/${SYNTH_ID}`,
    `/me/submissions/${SYNTH_ID}`,
    `/me/assignments/${SYNTH_ASN}`,
    `/assignments/${SYNTH_ASN}`,
    `/assignments/${SYNTH_ASN}/settings`,
    `/assignments/${SYNTH_ASN}/submissions`,
    `/assignments/${SYNTH_ASN}/deadlines`,
    `/assignments/${SYNTH_ASN}/upload`,
    `/assignments/${SYNTH_ASN}/plagiarism`,
    `/assignments/${SYNTH_ASN}/ai-analyses`,
    `/submissions/${SYNTH_ID}/ai-report`,
    `/plagiarism-runs/${SYNTH_RUN}`,
    `/plagiarism-runs/${SYNTH_RUN}/pairs/${SYNTH_PAIR}`,
    `/courses/${SYNTH_SLUG}`,
    `/courses/${SYNTH_SLUG}/settings`,
    `/courses/${SYNTH_SLUG}/members`,
    `/courses/${SYNTH_SLUG}/groups`,
    `/courses/${SYNTH_SLUG}/invitations`,
    `/courses/${SYNTH_SLUG}/stats`,
    `/courses/${SYNTH_SLUG}/dashboard`,
    `/courses/${SYNTH_SLUG}/exports`,
    `/courses/${SYNTH_SLUG}/scheduled-exports`,
    `/courses/${SYNTH_SLUG}/google-sheets`,
    `/courses/${SYNTH_SLUG}/suspicious`,
    `/courses/${SYNTH_SLUG}/homeworks/new`,
    `/courses/${SYNTH_SLUG}/homeworks/${SYNTH_HW}`,
    `/courses/${SYNTH_SLUG}/homeworks/${SYNTH_HW}/assignments/new`,
    `/courses/${SYNTH_SLUG}/assignments/new`,
    `/integrations/${SYNTH_INT}`,
    `/integrations/yandex-contest/${SYNTH_INT}/contests`,
    `/courses/join/some-code-1234`,
  ],
  student: [
    '/', '/me', '/me/assignments', '/me/submissions', '/me/grades',
    '/me/settings', '/me/profile', '/me/security',
    '/me/api-keys', '/me/external-bindings', '/me/2fa',
    '/me/exports',
    '/notifications',
    '/me/notifications/preferences', '/me/notifications/web-push',
    `/me/submissions/${SYNTH_ID}`,
    `/me/assignments/${SYNTH_ASN}`,
    `/submissions/${SYNTH_ID}`,
    `/courses/join/some-code-1234`,
    // student should also be able to view a course detail if invited
    `/courses/${SYNTH_SLUG}`,
  ],
};

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
      // also collapse numeric ids
      if (/^[0-9]+$/.test(seg)) return ':n';
      return seg;
    })
    .join('/');
}

function isVisitable(href) {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const u = new URL(href);
      return u.origin === BASE;
    } catch { return false; }
  }
  if (
    href.startsWith('/login') ||
    href.startsWith('/register') ||
    href.startsWith('/demo') ||
    href.startsWith('/auth/')
  ) return false;
  return href.startsWith('/');
}

function shouldIgnoreApiFinding(url, status) {
  if (url.includes('/api/v1/auth/refresh') && status === 401) return true;
  if (url.includes('/api/v1/auth/me') && status === 401) return true;
  // Synthetic test IDs — fed by the hunter itself. Backend 404/422 on these
  // is the correct response; we only want to flag the page-side handling
  // (crash/whitescreen), which is a separate check.
  if (/synth_test_id|synthetic-course-slug|synthetic-hw-slug|some-code-1234/.test(url)) return true;
  return false;
}

function isSyntheticRoute(p) {
  return /synth_test_id|synthetic-course-slug|synthetic-hw-slug|some-code-1234/.test(p);
}

async function expandAllGroups(page) {
  try {
    // open any nav-group-toggle that's collapsed (older sidebars used these).
    const toggles = await page.$$('[data-testid^="nav-group-toggle-"]');
    for (const t of toggles) {
      try {
        const expanded = await t.getAttribute('aria-expanded');
        if (expanded === 'false') await t.click({ timeout: 1000 });
      } catch { /* */ }
    }
  } catch { /* */ }
  // Also hover the sidebar so drawer items render in DOM (they are not
  // mounted hidden behind opacity-0 in our current impl, but doesn't hurt).
  try {
    const rail = await page.$('[data-testid="app-sidebar"]');
    if (rail) await rail.hover({ position: { x: 25, y: 180 } });
  } catch { /* */ }
}

async function harvestLinks(page) {
  const hrefs = await page.evaluate(() => {
    const out = new Set();
    // 1. <a href="…">
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (h) out.add(h);
    });
    // 2. router-aware buttons with data-nav-href (rare but exists in some shells)
    document.querySelectorAll('[data-nav-href]').forEach((el) => {
      const h = el.getAttribute('data-nav-href');
      if (h) out.add(h);
    });
    return Array.from(out);
  });
  return hrefs;
}

function pickPendingRequests(inflight, threshold) {
  const now = Date.now();
  const out = [];
  for (const [reqId, info] of inflight) {
    if (now - info.start > threshold) {
      out.push({ url: info.url, ageMs: now - info.start });
    }
  }
  return out;
}

async function crawlRole(role) {
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

  let currentUrl = '/';
  let recording = false;
  const inflight = new Map();

  page.on('request', (req) => {
    if (!recording) return;
    const url = req.url();
    if (!url.includes('/api/')) return;
    inflight.set(req, { url, start: Date.now() });
  });
  const finishReq = (req) => {
    inflight.delete(req);
  };
  page.on('requestfinished', finishReq);
  page.on('requestfailed', finishReq);

  page.on('response', async (resp) => {
    try {
      if (!recording) return;
      const req = resp.request();
      const url = resp.url();
      const status = resp.status();
      if (status < 400) return;
      if (!url.includes('/api/')) return;
      if (shouldIgnoreApiFinding(url, status)) return;
      findings.push({
        role: role.key,
        url: currentUrl,
        kind: `api_${status}`,
        detail: `${req.method()} ${new URL(url).pathname} → ${status}`,
      });
    } catch { /* */ }
  });

  page.on('pageerror', (err) => {
    if (!recording) return;
    findings.push({
      role: role.key,
      url: currentUrl,
      kind: 'pageerror',
      detail: String(err && err.message ? err.message : err).slice(0, 400),
    });
  });

  page.on('console', (msg) => {
    if (!recording) return;
    const t = msg.type();
    if (t !== 'error' && t !== 'warning') return;
    const text = msg.text();
    const loc = msg.location();
    const locUrl = (loc && loc.url) || '';
    // Known noise.
    if (/HMR|websocket|sourcemap|favicon|Download the React DevTools/i.test(text)) return;
    // HMR WS via vite client; appears as "Failed to load resource: net::ERR_CONNECTION_REFUSED"
    // whose stack location is the vite/@vite/client URL.
    if (/ERR_CONNECTION_REFUSED/.test(text) && /(:5174|@vite|@react-refresh|vite\/client)/.test(locUrl)) return;
    // Sometimes the stack is in node_modules/.vite/deps/* but the actual
    // WebSocket attempt is to port 5174; identify via locUrl :5174 or ws hint.
    if (/ERR_CONNECTION_REFUSED/.test(text) && /:5174/.test(locUrl)) return;
    if (/ERR_CONNECTION_REFUSED/.test(text) && locUrl === '') {
      // location empty → HMR ws connect failure, no JS frame attached.
      return;
    }
    // React-Router v6 warnings about future flags — purely informational
    if (/React Router Future Flag Warning/i.test(text)) return;
    // axios interceptor logs 401 from /auth/refresh; pattern: "Request failed with status code 401"
    if (/Request failed with status code 401/.test(text)) return;
    findings.push({
      role: role.key,
      url: currentUrl,
      kind: t === 'error' ? 'console_error' : 'console_warn',
      detail: text.slice(0, 400),
      where: locUrl ? locUrl.slice(0, 200) : null,
    });
  });

  // Login.
  await page.goto(`${BASE}/demo`, { timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector(`[data-testid="${role.btn}"]`, { timeout: NAV_TIMEOUT_MS });
  await page.click(`[data-testid="${role.btn}"]`);
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: NAV_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);

  recording = true;

  // Seed queue: explicit seeds + landing.
  const landingPath = new URL(page.url()).pathname;
  queue.push({ url: normalize(landingPath), depth: 0, why: 'landing' });
  for (const s of SEEDS[role.key] || []) {
    queue.push({ url: normalize(s), depth: 1, why: 'seed' });
  }

  while (queue.length > 0 && visited.size < MAX_PAGES_PER_ROLE) {
    const { url, depth, why } = queue.shift();
    if (visited.has(url)) continue;
    const tkey = templateKey(url);
    if (visitedTemplates.has(tkey)) continue;
    visited.add(url);
    visitedTemplates.add(tkey);

    recording = false;
    currentUrl = url;
    try {
      await page.evaluate((target) => {
        window.history.pushState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, url);
    } catch (e) {
      findings.push({
        role: role.key, url, kind: 'nav_error',
        detail: String(e).slice(0, 200),
      });
      continue;
    }
    await page.waitForTimeout(300);
    recording = true;

    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch { /* */ }
    await page.waitForTimeout(SETTLE_MS);

    await expandAllGroups(page);

    // 1) 404 page check.
    let is404 = false;
    try {
      const title = await page.title();
      if (title.includes('Не найдена') || title.includes('Not Found')) is404 = true;
    } catch { /* */ }
    if (!is404) {
      try {
        is404 = await page.evaluate(() => {
          const h1s = Array.from(document.querySelectorAll('h1'));
          return h1s.some((h) => h.textContent && h.textContent.trim() === '404');
        });
      } catch { /* */ }
    }
    if (is404 && !isSyntheticRoute(url)) {
      findings.push({ role: role.key, url, kind: '404', detail: `NotFoundPage rendered (origin=${why})` });
    }

    // 2) White-screen / ErrorBoundary check.
    try {
      const stats = await page.evaluate(() => {
        const body = document.body;
        const bodyText = (body?.innerText || '').trim();
        const errorBoundaryText = bodyText.match(/что-то пошло не так|Something went wrong|произошла ошибка/i);
        // Heuristic for white-screen: no <main>, no <h1>, no <h2>, body text < 20 chars
        const hasMain = !!document.querySelector('main, [role="main"], [data-testid="app-main"]');
        const hasH = !!document.querySelector('h1, h2, h3');
        return {
          textLen: bodyText.length,
          hasMain,
          hasH,
          errorBoundary: errorBoundaryText ? errorBoundaryText[0] : null,
        };
      });
      if (stats.errorBoundary) {
        findings.push({ role: role.key, url, kind: 'crash', detail: `ErrorBoundary: ${stats.errorBoundary}` });
      } else if (!stats.hasMain && stats.textLen < 20) {
        findings.push({ role: role.key, url, kind: 'crash', detail: `White screen (text=${stats.textLen} chars)` });
      }
    } catch { /* */ }

    // 3) Pending API requests > threshold.
    const pending = pickPendingRequests(inflight, PENDING_WARN_MS);
    for (const p of pending) {
      findings.push({
        role: role.key, url, kind: 'pending_api',
        detail: `still pending after ${p.ageMs}ms: ${new URL(p.url).pathname}`,
      });
    }

    // 4) Harvest links + push to queue.
    let hrefs = [];
    try {
      hrefs = await harvestLinks(page);
    } catch { /* */ }

    // 4a) If on a list-page with rows that lead to a detail, follow first
    // few (we want to cover *detail* routes too, depth >= 2 from sidebar).
    try {
      const rowHrefs = await page.evaluate(() => {
        const out = [];
        const candidates = [
          'tbody tr a[href]',
          '[data-testid^="course-card-"] a[href]',
          '[data-testid^="user-row-"] a[href]',
          '[data-testid^="tenant-row-"] a[href]',
          '[data-testid^="integration-row-"] a[href]',
          '[data-testid^="assignment-row-"] a[href]',
          '[data-testid^="submission-row-"] a[href]',
          '[data-testid^="row-"] a[href]',
          'ul li a[href]',
          '[data-testid="assignments-list"] a[href]',
          '[data-testid="submissions-list"] a[href]',
        ];
        const seen = new Set();
        for (const sel of candidates) {
          document.querySelectorAll(sel).forEach((el) => {
            const h = el.getAttribute('href');
            if (h && h.startsWith('/') && !seen.has(h)) {
              seen.add(h);
              out.push(h);
            }
          });
          if (out.length >= 3) break;
        }
        return out.slice(0, 3);
      });
      for (const h of rowHrefs) if (!hrefs.includes(h)) hrefs.push(h);
    } catch { /* */ }

    if (depth < 3) {
      for (const raw of hrefs) {
        if (!isVisitable(raw)) continue;
        const norm = normalize(raw);
        if (visited.has(norm)) continue;
        if (visitedTemplates.has(templateKey(norm))) continue;
        queue.push({ url: norm, depth: depth + 1, why: 'discovered' });
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
      process.stdout.write(`[${role.key}] visited=${result.visited.length} findings=${result.findings.length}\n`);
      for (const f of result.findings) {
        process.stdout.write(`  [${f.kind}] ${f.url}: ${f.detail}\n`);
      }
    } catch (e) {
      process.stdout.write(`[${role.key}] CRAWL FAILED: ${e}\n`);
      out[role.key] = { role: role.key, error: String(e) };
    }
  }
  fs.writeFileSync('/tmp/404-hunt.json', JSON.stringify(out, null, 2));
  process.stdout.write('\nWrote /tmp/404-hunt.json\n');
})();
