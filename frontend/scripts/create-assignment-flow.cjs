/* Manual creation flow: teacher creates assignment in first empty homework,
 * tries to access /assignments/:id/upload and submit code. Captures backend
 * errors and reports actual feasibility. */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const httpErrors = [];
  const errors = [];

  page.on('pageerror', (e) => errors.push({ kind: 'PAGEERROR', url: page.url(), msg: e.message }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/HMR|favicon|websocket|auth\/refresh.*401|net::ERR_ABORTED/i.test(t)) return;
    errors.push({ kind: 'console.error', url: page.url(), msg: t.slice(0, 200) });
  });
  page.on('response', (r) => {
    const s = r.status();
    if (s < 400 || s === 401 || s === 403) return;
    const u = r.url();
    if (/\.(?:png|jpg|gif|svg|woff2?|css|ico)\b/.test(u)) return;
    httpErrors.push({ status: s, url: u, route: page.url() });
  });

  // Login
  await page.goto('http://127.0.0.1:5173/demo', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click('[data-testid="demo-login-teacher"]', { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  console.log('=== step 1: open homework knad-cpp-1 ===');
  await page.evaluate(() => {
    window.history.pushState({}, '', '/courses/knad-cpp-24-25/homeworks/knad-cpp-1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/cre-01-homework.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } });

  console.log('\n=== step 2: click «Создать задание» ===');
  // Find by text content
  const createBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('a, button'));
    const found = btns.find((b) => /Создать задание/i.test(b.textContent || ''));
    if (!found) return null;
    return {
      tag: found.tagName,
      href: found.getAttribute('href'),
      testid: found.getAttribute('data-testid'),
      text: (found.textContent || '').trim().slice(0, 50),
    };
  });
  console.log(`  create button: ${JSON.stringify(createBtn)}`);
  if (createBtn?.href) {
    await page.evaluate((h) => {
      window.history.pushState({}, '', h);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, createBtn.href);
  } else if (createBtn?.testid) {
    await page.click(`[data-testid="${createBtn.testid}"]`);
  }
  await page.waitForTimeout(1500);
  const urlAfterClick = new URL(page.url()).pathname;
  console.log(`  url after click: ${urlAfterClick}`);
  await page.screenshot({ path: '/tmp/cre-02-create-form.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } });

  console.log('\n=== step 3: fill create-assignment form ===');
  // Inspect form structure
  const formInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('main input, main textarea, main select, main [role="combobox"]'));
    return inputs.map((el) => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      id: el.id,
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      testid: el.getAttribute('data-testid'),
      label: (() => {
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          return lbl?.textContent?.trim() ?? null;
        }
        return null;
      })(),
    }));
  });
  console.log(`  form inputs (${formInfo.length}):`);
  for (const f of formInfo) console.log(`    ${f.tag} id="${f.id}" testid="${f.testid}" label="${f.label}" placeholder="${f.placeholder}"`);

  // Fill required fields properly via Playwright fill() — it dispatches the
  // synthetic events React's controlled inputs expect.
  const ts = Date.now();
  await page.fill('[data-testid="hw-assignment-form-title"]', `Smoke ${ts}`).catch((e) => console.log(`  ! fill title: ${e.message}`));
  await page.fill('[data-testid="hw-assignment-form-slug"]', `smoke-${ts}`).catch((e) => console.log(`  ! fill slug: ${e.message}`));
  // Try to set deadlines (datetime-local inputs) — find them by their label.
  const deadlineInputIds = await page.$$eval('label', (labs) =>
    labs
      .filter((l) => /дедлайн/i.test(l.textContent || ''))
      .map((l) => l.getAttribute('for'))
      .filter(Boolean),
  );
  console.log(`  deadline input ids: ${JSON.stringify(deadlineInputIds)}`);
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  for (const id of deadlineInputIds) {
    await page.fill(`#${id}`, future).catch((e) => console.log(`  ! fill ${id}: ${e.message}`));
  }
  await page.waitForTimeout(500);
  const finalTitle = await page.$eval('[data-testid="hw-assignment-form-title"]', (e) => e.value);
  const finalSlug = await page.$eval('[data-testid="hw-assignment-form-slug"]', (e) => e.value);
  console.log(`  filled: title="${finalTitle}", slug="${finalSlug}", deadlines=${deadlineInputIds.length}`);

  // Look for submit button
  const submitInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('main button'));
    return btns
      .filter((b) => !b.disabled && b.offsetParent !== null)
      .map((b) => ({
        text: (b.textContent || '').trim().slice(0, 40),
        testid: b.getAttribute('data-testid'),
        type: b.getAttribute('type'),
      }))
      .filter((b) => /создать|сохранить|submit|опубликовать/i.test(b.text));
  });
  console.log(`  submit candidates: ${JSON.stringify(submitInfo, null, 2)}`);

  if (submitInfo.length > 0 && submitInfo[0].testid) {
    console.log(`  clicking submit: ${submitInfo[0].testid}`);
    await page.click(`[data-testid="${submitInfo[0].testid}"]`).catch((e) => console.log(`    ! ${e.message}`));
    await page.waitForTimeout(3000);
    const urlAfterSubmit = new URL(page.url()).pathname;
    console.log(`  url after submit: ${urlAfterSubmit}`);
    await page.screenshot({ path: '/tmp/cre-03-after-submit.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } });

    // Did it create the assignment?
    const onAssignmentPage = /^\/assignments\/[^/]+/.test(urlAfterSubmit);
    console.log(`  landed on assignment page: ${onAssignmentPage}`);
    if (onAssignmentPage) {
      const aText = await page.evaluate(() => document.body.innerText.slice(0, 600));
      console.log(`  assignment text: ${aText.replace(/\n/g, ' | ').slice(0, 400)}`);
    }
  } else {
    console.log(`  ! no submit button found`);
  }

  console.log('\n========== REPORT ==========');
  console.log(`HTTP 4xx/5xx (non-auth): ${httpErrors.length}`);
  for (const h of httpErrors.slice(0, 20)) console.log(`  ${h.status} ${h.url.slice(0, 130)}`);
  console.log(`errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.log(`  [${e.kind}] ${e.url}: ${e.msg}`);

  await browser.close();
})();
