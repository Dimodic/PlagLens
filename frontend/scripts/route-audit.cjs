/**
 * Route audit — depth=2 crawler under teacher/admin/student roles.
 *
 * Detects:
 *   - 404 page (document.title === "Страница не найдена" or h1 text === "404")
 *   - ErrorBoundary fallback
 *   - Component crash (body innerText < 50 chars after settle)
 *   - PAGEERROR / uncaught exceptions
 *   - console.error (filtered for known HMR/auth-refresh noise)
 *   - HTTP 4xx/5xx (filtered: 401 on /auth/refresh expected; 403 expected on role-guarded API)
 *
 * Output: /tmp/route-audit/{role}-{idx}-{slug}.png + _audit.json
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/route-audit';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const VIEWPORT = { width: 1280, height: 900 };

// Explicit deep-route lists. Includes all sidebar destinations + all
// in-app sub-pages reachable within depth=2 of role's start page.
const TARGETS = {
  teacher: {
    testId: 'teacher',
    urls: [
      // sidebar + landing
      '/', '/me', '/courses', '/integrations', '/settings',
      '/me/settings', '/me/profile', '/me/assignments', '/me/submissions',
      '/notifications', '/reports', '/imports', '/llm',
      // depth=2
      '/courses/new', '/courses/join',
      '/integrations/wizard', '/integrations/new',
      '/integrations/yandex-contest/setup',
      '/integrations/stepik/setup',
      '/integrations/ejudge/setup',
      '/me/security', '/me/api-keys', '/me/external-bindings', '/me/2fa',
      '/me/notifications/preferences', '/me/notifications/web-push',
      '/me/exports',
    ],
    // first-detail-link probe selectors for dynamic deep-routes
    detailProbes: [
      { from: '/courses', linkPattern: /^\/courses\/(?!new$|join$)/ },
      { from: '/integrations', linkPattern: /^\/integrations\/(?!wizard$|new$|oauth\/)/ },
      { from: '/me/assignments', linkPattern: /^\/me\/assignments\/[^/]+$/ },
      { from: '/me/submissions', linkPattern: /^\/me\/submissions\/[^/]+$/ },
    ],
  },
  admin: {
    testId: 'admin',
    urls: [
      '/', '/me', '/admin', '/admin/overview', '/admin/users',
      '/admin/audit', '/admin/integrations',
      '/admin/notifications/email', '/admin/ai/providers',
      '/admin/system/settings', '/admin/system/health', '/admin/roles',
      '/me/settings', '/me/profile', '/notifications',
      // depth=2
      '/admin/users/new',
      '/admin/integrations/new',
      '/admin/integrations/oauth-providers',
      '/admin/integrations/webhooks',
      '/admin/audit/search', '/admin/audit/access-denied',
      '/admin/audit/retention', '/admin/audit/legal-holds',
      '/admin/notifications/templates',
      '/admin/notifications/deliveries',
      '/admin/notifications/dlq',
      '/admin/ai/budgets', '/admin/ai/cache', '/admin/ai/prompt-versions',
      '/admin/exports', '/admin/plagiarism-corpus',
      '/admin/providers', '/admin/metrics', '/admin/settings',
      '/activity',
    ],
    detailProbes: [
      { from: '/admin/users', linkPattern: /^\/admin\/users\/(?!new$)/ },
      { from: '/admin/integrations', linkPattern: /^\/admin\/integrations\/(?!new$|oauth-providers$|webhooks$)/ },
    ],
  },
  student: {
    testId: 'student1',
    urls: [
      '/', '/me', '/me/assignments', '/me/submissions', '/me/grades',
      '/me/settings', '/me/profile', '/notifications',
      '/me/security', '/me/api-keys', '/me/external-bindings', '/me/2fa',
      '/me/notifications/preferences', '/me/notifications/web-push',
      '/me/exports',
    ],
    detailProbes: [
      { from: '/me/assignments', linkPattern: /^\/me\/assignments\/[^/]+$/ },
      { from: '/me/submissions', linkPattern: /^\/me\/submissions\/[^/]+$/ },
    ],
  },
};

// Noise patterns — known issues that should be ignored.
const NOISE = [
  /favicon/i, /net::ERR_ABORTED/, /websocket/i, /HMR/, /sourcemap/i,
  /\/auth\/refresh.*401/i,
];
function isNoise(s) { return NOISE.some((r) => r.test(s)); }

async function gotoSpa(page, url) {
  // SPA push — full goto wipes in-memory access token.
  try {
    await page.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, url);
  } catch {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await page.waitForTimeout(1400);
}

async function probePage(page, url) {
  return page.evaluate(() => {
    const title = document.title || '';
    const bodyText = (document.body.innerText || '').trim();
    const h1 = document.querySelector('h1');
    const errBoundary = !!document.querySelector('[data-testid="error-boundary-fallback"], [data-error-boundary]');
    const is404 =
      title === 'Страница не найдена' ||
      (h1 && h1.textContent.trim() === '404');
    // ErrorPage — router errorElement rendering. Title="Ошибка", h1=numeric status.
    const isError =
      title === 'Ошибка' ||
      (h1 && /^\d{3}$/.test(h1.textContent.trim()) && h1.textContent.trim() !== '404');
    // visual crash heuristic — body empty / "white screen"
    const veryEmpty = bodyText.length < 50;
    // any "fatal" pattern in DOM
    const fatal = /Что-то пошло не так|Something went wrong|Application error/i.test(bodyText);
    return {
      title, bodyLen: bodyText.length, h1: h1 ? h1.textContent.trim() : null,
      is404, isError, errBoundary, veryEmpty, fatal,
    };
  });
}

function slugify(url) {
  return url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
}

async function auditRole(browser, roleName, conf, results) {
  console.log(`\n=== ${roleName} (demo-login-${conf.testId}) ===`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const issues = [];

  page.on('pageerror', (e) =>
    issues.push({ role: roleName, kind: 'PAGEERROR', route: page.url(), msg: e.message }),
  );
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isNoise(t)) return;
    issues.push({ role: roleName, kind: 'console.error', route: page.url(), msg: t });
  });
  page.on('response', (resp) => {
    const status = resp.status();
    if (status < 400) return;
    if (status === 401 || status === 403) return; // role-guard expected
    const url = resp.url();
    if (/\.(?:png|jpg|gif|svg|woff2?|css|ico)\b/.test(url)) return;
    if (isNoise(url)) return;
    issues.push({ role: roleName, kind: `HTTP ${status}`, route: page.url(), msg: url });
  });

  // Demo login
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  try {
    await page.click(`[data-testid="demo-login-${conf.testId}"]`, { timeout: 6000 });
  } catch (e) {
    console.log(`  ! login failed: ${e.message}`);
    await ctx.close();
    return;
  }
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Crawl
  let idx = 0;
  for (const url of conf.urls) {
    idx++;
    await gotoSpa(page, url);
    let probe = null;
    try { probe = await probePage(page); } catch (e) {
      console.log(`  ! probe ${url}: ${e.message}`);
    }
    const slug = slugify(url);
    const shot = `${OUT_DIR}/${roleName}-${String(idx).padStart(2, '0')}-${slug}.png`;
    try { await page.screenshot({ path: shot, fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } }); }
    catch (e) { console.log(`  ! shot ${url}: ${e.message}`); }
    const mark = probe?.is404 ? '404' : probe?.isError ? '500' : probe?.errBoundary ? 'CRASH' : probe?.fatal ? 'FATAL' : probe?.veryEmpty ? 'EMPTY' : 'ok';
    console.log(`  ${url.padEnd(40)} → ${mark}   (${probe?.bodyLen}B)`);
    results.pages.push({ role: roleName, idx, url, slug, probe });
  }

  // Dynamic detail probes — visit list page, grab first matching detail link, follow.
  for (const probe of (conf.detailProbes || [])) {
    await gotoSpa(page, probe.from);
    const detailUrl = await page.evaluate((pat) => {
      const re = new RegExp(pat);
      const links = Array.from(document.querySelectorAll('a[href^="/"]'));
      for (const a of links) {
        const h = a.getAttribute('href');
        if (re.test(h)) return h;
      }
      return null;
    }, probe.linkPattern.source);
    if (!detailUrl) {
      console.log(`  ${probe.from}: no detail link matching ${probe.linkPattern}`);
      continue;
    }
    idx++;
    await gotoSpa(page, detailUrl);
    let p = null;
    try { p = await probePage(page); } catch (e) { console.log(`  ! ${detailUrl}: ${e.message}`); }
    const slug = slugify(detailUrl);
    const shot = `${OUT_DIR}/${roleName}-${String(idx).padStart(2, '0')}-${slug}.png`;
    try { await page.screenshot({ path: shot, fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } }); }
    catch (e) {/* */}
    const mark = p?.is404 ? '404' : p?.isError ? '500' : p?.errBoundary ? 'CRASH' : p?.fatal ? 'FATAL' : p?.veryEmpty ? 'EMPTY' : 'ok';
    console.log(`  ${detailUrl.padEnd(40)} → ${mark}   (${p?.bodyLen}B)  [detail-probe from ${probe.from}]`);
    results.pages.push({ role: roleName, idx, url: detailUrl, slug, probe: p, dynamic: true });
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
  const results = { pages: [], issues: [] };
  for (const [role, conf] of Object.entries(TARGETS)) {
    try { await auditRole(browser, role, conf, results); }
    catch (e) { console.log(`!! ${role}: ${e.message}`); }
  }
  await browser.close();

  // Categorize
  const broken = results.pages.filter((p) =>
    p.probe && (p.probe.is404 || p.probe.isError || p.probe.errBoundary || p.probe.fatal || p.probe.veryEmpty),
  );
  console.log(`\n========== SUMMARY ==========`);
  console.log(`  pages visited: ${results.pages.length}`);
  console.log(`  broken: ${broken.length}`);
  for (const b of broken) {
    const mark = b.probe.is404 ? '404' : b.probe.isError ? '500' : b.probe.errBoundary ? 'CRASH' : b.probe.fatal ? 'FATAL' : 'EMPTY';
    console.log(`    [${b.role}] ${mark.padEnd(5)} ${b.url}`);
  }
  console.log(`  issues: ${results.issues.length}`);
  const byKind = {};
  for (const i of results.issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  for (const [k, v] of Object.entries(byKind)) console.log(`    ${k}: ${v}`);
  for (const i of results.issues.slice(0, 30)) {
    console.log(`    - [${i.kind}] ${i.role} ${i.route}: ${i.msg.slice(0, 140)}`);
  }

  fs.writeFileSync(`${OUT_DIR}/_audit.json`, JSON.stringify(results, null, 2));
  console.log(`\n  → ${OUT_DIR}/_audit.json`);
})();
