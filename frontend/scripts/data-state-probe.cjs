/* Probe demo data state: walk through all 10 homeworks in knad-cpp-24-25,
 * report which ones have assignments / submissions. Also check student-side
 * /me/submissions and /me/assignments. */
const { chromium } = require('playwright-core');

async function login(page, role) {
  await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click(`[data-testid="demo-login-${role}"]`, { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function spaNav(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url).catch(() => {});
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ----- teacher -----
  const tCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tPage = await tCtx.newPage();
  await login(tPage, 'teacher');
  console.log('=== teacher ===');

  await spaNav(tPage, '/courses/knad-cpp-24-25');
  const hwLinks = await tPage.$$eval('main a[href*="/homeworks/"]', (els) =>
    els.map((e) => e.getAttribute('href')).filter((h) => /^\/courses\/[^/]+\/homeworks\/(?!new$)[^/]+$/.test(h)),
  );
  console.log(`  homework count: ${hwLinks.length}`);

  for (const hw of hwLinks) {
    await spaNav(tPage, hw);
    const data = await tPage.evaluate(() => {
      const text = document.body.innerText;
      const assignLinks = Array.from(document.querySelectorAll('main a[href^="/assignments/"]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => /^\/assignments\/[^/]+$/.test(h));
      const hasNoAssignmentsText = /Нет заданий/i.test(text);
      return { assignLinks, hasNoAssignmentsText, title: document.querySelector('h1')?.textContent?.trim() ?? '' };
    });
    console.log(`  ${hw}: assignments=${data.assignLinks.length} ${data.hasNoAssignmentsText ? '(empty)' : ''}  "${data.title}"`);
    if (data.assignLinks.length > 0) {
      console.log(`    first assignment: ${data.assignLinks[0]}`);
      await spaNav(tPage, data.assignLinks[0]);
      const subs = await tPage.$$eval('main a[href^="/submissions/"]', (els) =>
        els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h)),
      );
      console.log(`    submissions on this assignment: ${subs.length}`);
      if (subs[0]) console.log(`    first submission: ${subs[0]}`);
    }
  }

  await spaNav(tPage, '/me/submissions');
  const tSubs = await tPage.$$eval('main a[href^="/submissions/"]', (els) =>
    els.map((e) => e.getAttribute('href')).filter((h) => /^\/submissions\/[^/]+$/.test(h)),
  );
  console.log(`  teacher /me/submissions: ${tSubs.length}`);

  await tCtx.close();

  // ----- student1 -----
  const sCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sPage = await sCtx.newPage();
  await login(sPage, 'student1');
  console.log('\n=== student1 ===');

  for (const url of ['/me/assignments', '/me/submissions', '/me/grades']) {
    await spaNav(sPage, url);
    const text = await sPage.evaluate(() => document.body.innerText.slice(0, 250));
    const links = await sPage.$$eval('main a[href^="/"]', (els) =>
      els.map((e) => e.getAttribute('href')).filter((h) => /^\/(submissions|assignments|me\/assignments|me\/submissions)\/[^/]+/.test(h)),
    );
    console.log(`  ${url}: links=${links.length}  text="${text.replace(/\n/g, ' | ').slice(0, 200)}"`);
    if (links[0]) console.log(`    first: ${links[0]}`);
  }

  await sCtx.close();
  await browser.close();
})();
