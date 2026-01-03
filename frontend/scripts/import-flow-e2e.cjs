/* End-to-end import flow under teacher:
 *
 *  1. /demo → demo-login-teacher
 *  2. /integrations → enumerate every integration card, note kind
 *  3. /imports → click «Запустить» on every imports-run-* button (waits toast)
 *  4. Wait for backend sync to settle, refresh list
 *  5. /courses → first course → assignments → submissions
 *  6. Open first submission → confirm code viewer renders
 *  7. /assignments/:id/plagiarism → trigger run if button exists
 *  8. Open run → open first pair → confirm diff renders
 *
 * Captures: PAGEERROR, console.error (post-noise), HTTP 4xx/5xx.
 * Screenshots: /tmp/import-flow/{step}.png
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/import-flow';
const BASE = 'http://127.0.0.1:5173';

function isNoise(t) {
  return /HMR|favicon|net::ERR_ABORTED|websocket|sourcemap|auth\/refresh.*401/i.test(t);
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
  await page.waitForTimeout(1500);
}

async function shot(page, name) {
  const path = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } }).catch(() => {});
}

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

  page.on('pageerror', (e) => errors.push({ kind: 'PAGEERROR', route: page.url(), msg: e.message }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isNoise(t)) return;
    errors.push({ kind: 'console.error', route: page.url(), msg: t.slice(0, 250) });
  });
  page.on('response', (r) => {
    const s = r.status();
    if (s < 400) return;
    if (s === 401 || s === 403) return;
    const u = r.url();
    if (/\.(?:png|jpg|gif|svg|woff2?|css|ico)\b/.test(u)) return;
    if (isNoise(u)) return;
    httpErrors.push({ status: s, route: page.url(), url: u });
  });

  // 1. Login
  console.log('=== STEP 1: demo-login-teacher ===');
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`  URL after login: ${new URL(page.url()).pathname}`);
  await shot(page, '01-after-login');

  // 2. List integrations
  console.log('\n=== STEP 2: enumerate /integrations ===');
  await spaNav(page, '/integrations');
  await shot(page, '02-integrations-list');
  const intCards = await page.$$eval('main a[href^="/integrations/"]', (els) =>
    els
      .map((e) => ({
        href: e.getAttribute('href'),
        text: (e.textContent || '').trim().slice(0, 80),
      }))
      .filter((c) => /^\/integrations\/(?!wizard$|new$|oauth\/)/.test(c.href || ''))
      .filter((c, i, arr) => arr.findIndex((x) => x.href === c.href) === i),
  );
  console.log(`  found ${intCards.length} integration card(s):`);
  for (const c of intCards) console.log(`    - ${c.href}  "${c.text}"`);

  // For each, open detail page to learn its kind
  const integrations = [];
  for (const c of intCards) {
    await spaNav(page, c.href);
    await page.waitForTimeout(1200);
    const meta = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const body = document.body.innerText.slice(0, 600);
      return { h1: h1?.textContent?.trim() ?? null, body };
    });
    const kind =
      /yandex|y\.contest|яндекс/i.test(meta.body) ? 'yandex_contest' :
      /stepik/i.test(meta.body) ? 'stepik' :
      /ejudge/i.test(meta.body) ? 'ejudge' :
      /manual|zip/i.test(meta.body) ? 'manual' : 'unknown';
    integrations.push({ href: c.href, h1: meta.h1, kind });
    console.log(`    ${c.href}: h1="${meta.h1}", kind=${kind}`);
  }

  // 3. /imports — click every «Запустить»
  console.log('\n=== STEP 3: /imports — run all syncs ===');
  await spaNav(page, '/imports');
  await page.waitForTimeout(1500);
  await shot(page, '03-imports-before');
  const runButtons = await page.$$eval(
    '[data-testid^="imports-run-"]:not([disabled])',
    (els) =>
      els.map((e) => ({
        testid: e.getAttribute('data-testid'),
        text: (e.textContent || '').trim(),
        disabled: e.hasAttribute('disabled'),
      })),
  );
  console.log(`  found ${runButtons.length} runnable integration(s)`);
  let i = 0;
  for (const b of runButtons) {
    i++;
    console.log(`  [${i}/${runButtons.length}] click ${b.testid} ...`);
    const before = await page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').length);
    try {
      await page.click(`[data-testid="${b.testid}"]`, { timeout: 3000 });
    } catch (e) {
      console.log(`    ! click failed: ${e.message}`);
      continue;
    }
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').length);
    const toastText = await page.evaluate(() => {
      const ts = document.querySelectorAll('[data-sonner-toast]');
      return ts.length > 0 ? Array.from(ts).map((t) => t.textContent?.trim()).join(' | ') : null;
    });
    console.log(`    toast count ${before}→${after}, text: ${toastText || '(none)'}`);
  }
  await shot(page, '03-imports-after');

  // 4. Wait for backend to actually do work
  console.log('\n=== STEP 4: wait 8s for backend sync to settle ===');
  await page.waitForTimeout(8000);

  // 5. /courses → first course → assignments
  console.log('\n=== STEP 5: /courses → first course → submissions ===');
  await spaNav(page, '/courses');
  await shot(page, '05-courses-list');
  const courseLinks = await page.$$eval('main a[href^="/courses/"]', (els) =>
    els
      .map((e) => e.getAttribute('href'))
      .filter((h) => /^\/courses\/(?!new$|join$)[^/]+$/.test(h)),
  );
  const firstCourse = courseLinks[0];
  console.log(`  first course: ${firstCourse}`);
  if (firstCourse) {
    await spaNav(page, firstCourse);
    await page.waitForTimeout(1500);
    await shot(page, '05-course-detail');
    const courseText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log(`  course detail (400ch): ${courseText.replace(/\n/g, ' | ')}`);

    // find homework links (homeworks contain assignments)
    const hwLinks = await page.$$eval('main a[href*="/homeworks/"]', (els) =>
      els.map((e) => e.getAttribute('href')).filter((h) => /^\/courses\/[^/]+\/homeworks\/(?!new$)[^/]+$/.test(h)),
    );
    console.log(`  homework links: ${hwLinks.length}`);
    const firstHw = hwLinks[0];
    if (firstHw) {
      console.log(`  first homework: ${firstHw}`);
      await spaNav(page, firstHw);
      await page.waitForTimeout(1500);
      await shot(page, '05-homework-detail');
      const hwText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log(`  homework detail (400ch): ${hwText.replace(/\n/g, ' | ')}`);
    }

    // Now look for assignment links (in homework OR fallback to /me/submissions)
    let assignLinks = await page.$$eval('main a[href^="/assignments/"]', (els) =>
      els.map((e) => e.getAttribute('href')).filter((h) => /^\/assignments\/[^/]+$/.test(h)),
    );
    let firstAssign = assignLinks[0];
    if (!firstAssign) {
      // Fallback: teacher's submissions list — find submission, navigate back to assignment
      console.log(`  no assignment in homework; trying /me/submissions ...`);
      await spaNav(page, '/me/submissions');
      await shot(page, '05-my-submissions');
      const subFromList = await page.$$eval('main a[href^="/submissions/"]', (els) =>
        els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h)),
      );
      console.log(`  /me/submissions: ${subFromList.length} submission links`);
      if (subFromList[0]) {
        console.log(`  opening submission ${subFromList[0]} directly`);
        await spaNav(page, subFromList[0]);
        await page.waitForTimeout(1500);
        await shot(page, '06-submission-detail');
        const hasCode = await page.evaluate(() => {
          const codeEl = document.querySelector('pre code, [data-testid*="code"], [class*="hljs"], [class*="monaco"], [class*="cm-content"]');
          const text = document.body.innerText;
          return {
            hasViewerDom: !!codeEl,
            bodyExcerpt: text.slice(0, 500),
          };
        });
        console.log(`  submission code viewer DOM: ${hasCode.hasViewerDom}`);
        console.log(`  page text (500ch): ${hasCode.bodyExcerpt.replace(/\n/g, ' | ')}`);
      }
    }
    console.log(`  first assignment (after homework dive): ${firstAssign || '(none)'}`);
    if (firstAssign) {
      await spaNav(page, firstAssign);
      await page.waitForTimeout(1500);
      await shot(page, '05-assignment-detail');
      const aText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log(`  assignment detail (400ch): ${aText.replace(/\n/g, ' | ')}`);

      // find submissions on assignment page
      const subLinks = await page.$$eval('main a[href^="/submissions/"]', (els) =>
        els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h)),
      );
      const firstSub = subLinks[0];
      console.log(`  first submission: ${firstSub || '(none)'}`);
      if (firstSub) {
        await spaNav(page, firstSub);
        await page.waitForTimeout(1500);
        await shot(page, '06-submission-detail');
        // Look for code-viewer-ish DOM
        const hasCode = await page.evaluate(() => {
          const codeEl = document.querySelector('pre code, [data-testid*="code"], [class*="hljs"], [class*="monaco"]');
          return !!codeEl;
        });
        console.log(`  submission has code viewer DOM: ${hasCode}`);
      }

      // 7. Plagiarism flow
      console.log('\n=== STEP 7: plagiarism on assignment ===');
      const plagPath = firstAssign + '/plagiarism';
      await spaNav(page, plagPath);
      await page.waitForTimeout(1500);
      await shot(page, '07-plagiarism-list');
      const plagText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log(`  plagiarism page (400ch): ${plagText.replace(/\n/g, ' | ')}`);

      // try clicking the launch-new-run button if present
      const runBtn = await page.$('[data-testid="plagiarism-run-new"]').catch(() => null);
      if (runBtn) {
        console.log(`  clicking «запустить новую проверку» ...`);
        await runBtn.click().catch((e) => console.log(`    ! click err: ${e.message}`));
        await page.waitForTimeout(2000);
        await shot(page, '07-plagiarism-after-run');
      } else {
        console.log(`  no run-new button visible`);
      }

      // find any run link
      const runLinks = await page.$$eval('main a[href^="/plagiarism-runs/"]', (els) =>
        els.map((e) => e.getAttribute('href')).filter((h) => /^\/plagiarism-runs\/[^/]+$/.test(h)),
      );
      const firstRun = runLinks[0];
      console.log(`  first plagiarism run: ${firstRun || '(none)'}`);
      if (firstRun) {
        await spaNav(page, firstRun);
        await page.waitForTimeout(1500);
        await shot(page, '08-plagiarism-run-detail');
        const pairLinks = await page.$$eval(
          'main a[href*="/plagiarism-runs/"][href*="/pairs/"]',
          (els) => els.map((e) => e.getAttribute('href')),
        );
        const firstPair = pairLinks[0];
        console.log(`  first pair link: ${firstPair || '(none)'}`);
        if (firstPair) {
          await spaNav(page, firstPair);
          await page.waitForTimeout(1500);
          await shot(page, '09-pair-diff');
          const hasDiff = await page.evaluate(() => {
            return !!document.querySelector('[class*="diff"], pre code, [data-testid*="diff"]');
          });
          console.log(`  pair-diff page has diff viewer DOM: ${hasDiff}`);
        }
      }
    }
  }

  await browser.close();

  // Report
  console.log('\n========== REPORT ==========');
  console.log(`integrations found: ${integrations.length}`);
  for (const it of integrations) console.log(`  ${it.kind.padEnd(15)} ${it.href}  "${it.h1}"`);
  console.log(`\nerrors (page/console): ${errors.length}`);
  for (const e of errors.slice(0, 30)) console.log(`  [${e.kind}] ${e.route}: ${e.msg}`);
  console.log(`\nHTTP 4xx/5xx (non-auth): ${httpErrors.length}`);
  for (const h of httpErrors.slice(0, 30)) console.log(`  ${h.status} ${h.url.slice(0, 130)}  @ ${h.route}`);

  fs.writeFileSync(`${OUT_DIR}/_report.json`, JSON.stringify({ integrations, errors, httpErrors }, null, 2));
  console.log(`\n→ ${OUT_DIR}/_report.json`);
})();
