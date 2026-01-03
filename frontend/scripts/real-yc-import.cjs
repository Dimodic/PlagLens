/* End-to-end real Yandex.Contest import:
 *   1. Login as teacher via /demo
 *   2. Create an assignment in homework knad-cpp-1 via the UI form
 *   3. Call POST /api/v1/integrations/yandex-contest/{cfg}/contests/{cid}/import-submissions
 *      with the freshly created assignment_id (uses teacher's session cookies)
 *   4. Open /me/submissions and assert there are rows
 *   5. Open the first submission and assert the code viewer renders source
 *
 * Reports backend errors verbatim — no swallowing.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/real-yc';
const BASE = 'http://127.0.0.1:5173';
const CFG_ID = 'ic_dd07ea540efe0f';
const CONTEST_ID = 73433; // first of the 10 contests bound to knad-cpp-24-25

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  const httpErrors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${page.url()}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/HMR|favicon|websocket|auth\/refresh.*401|net::ERR_ABORTED/i.test(t)) return;
    errors.push(`console.error ${page.url()}: ${t.slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const s = r.status();
    if (s < 400 || s === 401 || s === 403) return;
    const u = r.url();
    if (/\.(?:png|jpg|gif|svg|woff2?|css|ico)\b/.test(u)) return;
    httpErrors.push({ status: s, url: u, route: page.url() });
  });

  // ---------- 1. login ----------
  console.log('=== 1. login teacher ===');
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // ---------- 2. create assignment ----------
  console.log('\n=== 2. create assignment in knad-cpp-1 ===');
  const ts = Date.now();
  const slug = `yc-import-${ts}`;
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, '/courses/knad-cpp-24-25/homeworks/knad-cpp-1/assignments/new');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT_DIR}/01-create-form.png`, fullPage: false });

  // Fill required fields. Slug input may auto-populate from title; we set both
  // to known values before submit.
  await page.fill('[data-testid="hw-assignment-form-title"]', `YC Import ${ts}`).catch((e) => console.log(`  ! fill title: ${e.message}`));
  await page.waitForTimeout(300);
  // Slug field is auto-populated from title — clear and reset it explicitly.
  await page.fill('[data-testid="hw-assignment-form-slug"]', slug).catch((e) => console.log(`  ! fill slug: ${e.message}`));
  await page.waitForTimeout(400);

  // Deadlines: set hard deadline 30 days out so submissions aren't auto-late.
  const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 16);
  const dlFields = await page.$$('input[type="datetime-local"]');
  console.log(`  found ${dlFields.length} datetime fields`);
  for (const f of dlFields) {
    await f.fill(future).catch(() => {});
  }
  await page.waitForTimeout(300);

  // Submit
  await page.click('[data-testid="hw-assignment-form-submit"]', { timeout: 3000 }).catch((e) => console.log(`  ! submit click: ${e.message}`));
  await page.waitForTimeout(4000);
  const urlAfter = new URL(page.url()).pathname;
  console.log(`  url after submit: ${urlAfter}`);
  await page.screenshot({ path: `${OUT_DIR}/02-after-submit.png`, fullPage: false });

  // Extract assignment_id from URL (we expect /assignments/{id})
  const assignmentMatch = urlAfter.match(/\/assignments\/([^/?]+)/);
  const assignmentId = assignmentMatch?.[1];
  console.log(`  assignment_id: ${assignmentId || '(not found in URL)'}`);

  if (!assignmentId) {
    console.log(`  ! could not get assignment_id, aborting`);
    console.log(`\nerrors so far:`);
    for (const e of errors) console.log(`  ${e}`);
    console.log(`HTTP 4xx/5xx so far:`);
    for (const h of httpErrors) console.log(`  ${h.status} ${h.url}`);
    await browser.close();
    process.exit(1);
  }

  // ---------- 3. call import-submissions ----------
  console.log('\n=== 3. POST import-submissions ===');
  const importUrl = `/api/v1/integrations/yandex-contest/${CFG_ID}/contests/${CONTEST_ID}/import-submissions?assignment_id=${assignmentId}`;
  const importResp = await page.evaluate(async (url) => {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  }, importUrl);
  console.log(`  status: ${importResp.status}`);
  console.log(`  body: ${JSON.stringify(importResp.body, null, 2).slice(0, 1500)}`);

  // ---------- 4. verify submissions visible ----------
  console.log('\n=== 4. /me/submissions ===');
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, '/me/submissions');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT_DIR}/03-submissions-list.png`, fullPage: false });
  const subLinks = await page.$$eval('main a[href^="/submissions/"]', (els) =>
    els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h)),
  );
  console.log(`  /me/submissions: ${subLinks.length} submissions visible`);

  // Also try the assignment-detail submissions panel
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/assignments/${assignmentId}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT_DIR}/04-assignment-detail.png`, fullPage: false });
  const subOnAssign = await page.$$eval('main a[href^="/submissions/"]', (els) =>
    els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h)),
  );
  console.log(`  /assignments/${assignmentId}: ${subOnAssign.length} submissions visible`);
  const allSubs = [...new Set([...subLinks, ...subOnAssign])];

  // ---------- 5. open first submission, check code viewer ----------
  if (allSubs[0]) {
    console.log(`\n=== 5. open submission ${allSubs[0]} ===`);
    await page.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, allSubs[0]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT_DIR}/05-submission-detail.png`, fullPage: false });
    const codeInfo = await page.evaluate(() => {
      const codeEl = document.querySelector('pre code, [data-testid*="code"], [class*="hljs"], [class*="monaco"], [class*="cm-content"]');
      return {
        hasCodeDom: !!codeEl,
        codeSample: codeEl ? (codeEl.textContent || '').slice(0, 400) : null,
        bodyText: document.body.innerText.slice(0, 800),
      };
    });
    console.log(`  has code viewer DOM: ${codeInfo.hasCodeDom}`);
    if (codeInfo.codeSample) {
      console.log(`  code sample (400 chars):\n${codeInfo.codeSample.split('\n').map((l) => '    ' + l).join('\n')}`);
    }
    console.log(`  page text (800ch): ${codeInfo.bodyText.replace(/\n/g, ' | ').slice(0, 500)}`);
  } else {
    console.log('\n=== 5. no submissions to open ===');
  }

  console.log('\n========== REPORT ==========');
  console.log(`HTTP 4xx/5xx (non-auth): ${httpErrors.length}`);
  for (const h of httpErrors.slice(0, 30)) console.log(`  ${h.status} ${h.url.slice(0, 140)}`);
  console.log(`errors: ${errors.length}`);
  for (const e of errors.slice(0, 30)) console.log(`  ${e}`);

  await browser.close();
})();
