/**
 * Integration smoke-test — verify every integration / admin surface renders
 * past role-guards, opens its primary action without crashing, and shows the
 * controls a user would need to drive it.
 *
 * Read-only on backend state: we DO NOT submit forms / press destructive
 * buttons / actually run any import. We just click "open modal" / "next step"
 * / etc. and check the DOM probes.
 *
 * Output → /tmp/integration-smoke/ (inside the dev container).
 * Copy out → docker cp plaglens-frontend-dev:/tmp/integration-smoke \
 *                       frontend/scripts/integration-smoke
 *
 * Auth template — /demo → demo-login-{testId}, then SPA-push history (full
 * goto wipes the in-memory access token; this pattern is shared with
 * redesign-verify-v2.cjs and route-audit.cjs).
 *
 * Scenarios (admin unless noted):
 *   A. Integration wizard (4 steps, kind=stepik/yandex_contest/manual, cancel
 *      via back-link)
 *   B. Integration detail (first card on /integrations → open)
 *   C. Provider-specific setup pages (yandex-contest / stepik / ejudge)
 *   D. OAuth callback — empty + invalid state
 *   E. LLM providers (list + edit modal open/close + budgets/cache/prompt-versions)
 *   F. Notifications (email / templates + edit / deliveries / dlq)
 *   G. Webhooks (admin log + filter)
 *   H. MOSS / plagiarism corpus
 *   I. Submission flow as teacher (assignment → plagiarism tab → start modal)
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const OUT_DIR = '/tmp/integration-smoke';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const VIEWPORT = { width: 1280, height: 900 };
const TIMESTAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

// noise filter — superset of route-audit.cjs. The bare console.error from the
// browser for the HMR-ws/auth-refresh background ops is just
//   "Failed to load resource: net::ERR_CONNECTION_REFUSED"
// or
//   "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
// — neither contains "HMR"/"websocket"/"/auth/refresh" in the message itself, so
// we widen the filter to catch the resource-load lines (the *type* of those
// errors is known harmless; the request URL is what matters and that URL is
// only available on the network-listener path, not here).
const NOISE = [
  /favicon/i,
  /net::ERR_ABORTED/,
  /net::ERR_CONNECTION_REFUSED/,
  /websocket/i,
  /HMR/,
  /sourcemap/i,
  /\/auth\/refresh.*401/i,
  /Failed to load resource.*status of 401/i,
];
function isNoise(s) { return NOISE.some((r) => r.test(s)); }

async function gotoSpa(page, url, settleMs = 1400) {
  try {
    await page.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, url);
  } catch {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await page.waitForTimeout(settleMs);
}

async function shot(page, name) {
  try {
    await page.screenshot({
      path: `${OUT_DIR}/${name}.png`,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
  } catch (e) {
    console.log(`  ! shot ${name}: ${e.message}`);
  }
}

async function probePage(page) {
  return page.evaluate(() => {
    const title = document.title || '';
    const bodyText = (document.body.innerText || '').trim();
    const h1 = document.querySelector('h1');
    const errBoundary = !!document.querySelector(
      '[data-testid="error-boundary-fallback"], [data-error-boundary]',
    );
    const is404 = title === 'Страница не найдена' ||
      (h1 && h1.textContent.trim() === '404');
    const isError = title === 'Ошибка' ||
      (h1 && /^\d{3}$/.test(h1.textContent.trim()) && h1.textContent.trim() !== '404');
    return {
      title,
      bodyLen: bodyText.length,
      h1: h1 ? h1.textContent.trim() : null,
      is404,
      isError,
      errBoundary,
    };
  });
}

function newIssuesCollector() {
  return [];
}

function attachListeners(page, issues, scenario) {
  page.on('pageerror', (e) =>
    issues.push({ scenario, kind: 'PAGEERROR', route: page.url(), msg: e.message }),
  );
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isNoise(t)) return;
    issues.push({ scenario, kind: 'console.error', route: page.url(), msg: t });
  });
  page.on('response', (resp) => {
    const status = resp.status();
    if (status < 400) return;
    if (status === 401 || status === 403) return;
    const url = resp.url();
    if (/\.(?:png|jpg|gif|svg|woff2?|css|ico)\b/.test(url)) return;
    if (isNoise(url)) return;
    issues.push({ scenario, kind: `HTTP ${status}`, route: page.url(), msg: url });
  });
}

async function demoLogin(page, testId) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.click(`[data-testid="demo-login-${testId}"]`, { timeout: 6000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

function record(results, scenario, status, details) {
  results.scenarios.push({ scenario, status, details, ts: Date.now() });
  const marker = status === 'pass' ? '+' : status === 'partial' ? '~' : '-';
  console.log(`  [${marker}] ${scenario}: ${status}${details ? ` — ${details}` : ''}`);
}

// ─── Scenario A: Integration wizard ────────────────────────────────────────
async function scenarioA(page, results) {
  const scenario = 'A: Integration wizard';
  console.log(`\n--- ${scenario} ---`);

  // 1. Open /integrations
  await gotoSpa(page, '/integrations');
  await shot(page, 'A-01-integrations-list');
  let probe = await probePage(page);
  if (probe.is404 || probe.isError) {
    record(results, scenario, 'fail', `integrations list crashed: ${probe.title}`);
    return;
  }

  // 2. Click "Мастер настройки" (data-testid="integrations-new-button")
  const wizardBtn = page.locator('[data-testid="integrations-new-button"]').first();
  if (!(await wizardBtn.count())) {
    record(results, scenario, 'fail', 'wizard button not found on /integrations');
    return;
  }
  await wizardBtn.click();
  await page.waitForTimeout(1200);
  await shot(page, 'A-02-wizard-step1-source');

  probe = await probePage(page);
  if (probe.is404 || probe.isError) {
    record(results, scenario, 'fail', `wizard crashed: ${probe.title}`);
    return;
  }
  if (!page.url().includes('/integrations/wizard')) {
    record(results, scenario, 'fail', `wizard URL mismatch: ${page.url()}`);
    return;
  }

  // 3. Step 1 — verify all three sources clickable
  const sources = ['stepik', 'yandex_contest', 'manual'];
  const sourcesProbe = {};
  for (const s of sources) {
    const el = page.locator(`[data-testid="import-source-${s}"]`).first();
    if (await el.count()) {
      await el.click();
      await page.waitForTimeout(250);
      sourcesProbe[s] = 'ok';
    } else {
      sourcesProbe[s] = 'missing';
    }
  }
  // Re-pick stepik as default, then next.
  await page.locator('[data-testid="import-source-stepik"]').first().click().catch(() => {});
  await page.waitForTimeout(200);

  // 4. Step 2 — name
  await page.locator('[data-testid="import-wizard-next"]').first().click().catch(() => {});
  await page.waitForTimeout(900);
  await shot(page, 'A-03-wizard-step2-auth');
  const nameInput = page.locator('[data-testid="import-display-name"]').first();
  if (await nameInput.count()) {
    await nameInput.fill(`Smoke test ${TIMESTAMP}`);
  }

  // 5. Step 3 — course
  await page.locator('[data-testid="import-wizard-next"]').first().click().catch(() => {});
  await page.waitForTimeout(900);
  await shot(page, 'A-04-wizard-step3-course');

  // 6. Step 4 — run page; verify ONE primary button visible and DO NOT click it.
  await page.locator('[data-testid="import-wizard-next"]').first().click().catch(() => {});
  await page.waitForTimeout(900);
  await shot(page, 'A-05-wizard-step4-run');

  const runBtn = page.locator('[data-testid="import-wizard-run"]').first();
  const runVisible = (await runBtn.count()) > 0 && (await runBtn.isVisible());
  const runDisabled = runVisible ? await runBtn.isDisabled() : null;

  // 7. Cancel via top back-link.
  const backLink = page.locator('[data-testid="import-wizard-back"]').first();
  const cancelOk = await backLink.count() > 0;
  if (cancelOk) {
    await backLink.click();
    await page.waitForTimeout(900);
  }
  const backUrl = page.url();
  const backHome = backUrl.endsWith('/integrations') || backUrl.endsWith('/integrations/');
  await shot(page, 'A-06-after-cancel');

  const allSourcesOk = sources.every((s) => sourcesProbe[s] === 'ok');
  const status =
    !allSourcesOk ? 'partial' :
    !runVisible ? 'partial' :
    !backHome ? 'partial' :
    'pass';
  record(results, scenario, status, JSON.stringify({
    sourcesProbe, runVisible, runDisabled, backUrl, backHome,
  }));
}

// ─── Scenario B: Integration detail ────────────────────────────────────────
async function scenarioB(page, results) {
  const scenario = 'B: Integration detail';
  console.log(`\n--- ${scenario} ---`);
  await gotoSpa(page, '/integrations');
  const linkHref = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid^="integration-row-"]'));
    if (cards.length === 0) return null;
    const open = cards[0].querySelector('a[href^="/integrations/"]');
    return open ? open.getAttribute('href') : null;
  });
  if (!linkHref) {
    record(results, scenario, 'partial', 'no existing integrations to open (demo data)');
    return;
  }
  await gotoSpa(page, linkHref);
  await shot(page, 'B-01-integration-detail');
  const probe = await probePage(page);
  if (probe.is404 || probe.isError || probe.errBoundary) {
    record(results, scenario, 'fail', `detail crashed: ${probe.title}`);
    return;
  }

  // Buttons we expect: Tabs, Save, Test (test connection), Sync now
  const buttonCounts = await page.evaluate(() => {
    const labels = ['Сохранить', 'Проверить', 'Тест', 'Запустить импорт', 'Удалить', 'OAuth', 'Подключить', 'Открыть'];
    const out = {};
    for (const lab of labels) {
      out[lab] = Array.from(document.querySelectorAll('button, a')).filter(
        (b) => b.textContent && b.textContent.includes(lab),
      ).length;
    }
    return out;
  });
  record(results, scenario, 'pass', `url=${linkHref} bodyLen=${probe.bodyLen} buttons=${JSON.stringify(buttonCounts)}`);
}

// ─── Scenario C: Provider-specific setup ───────────────────────────────────
async function scenarioC(page, results) {
  const scenario = 'C: Provider setup pages';
  console.log(`\n--- ${scenario} ---`);
  const targets = [
    {
      url: '/integrations/yandex-contest/setup',
      slug: 'yandex-contest',
      expectedInputs: ['select', 'button'], // course select + Подключить
    },
    {
      url: '/integrations/stepik/setup',
      slug: 'stepik',
      expectedInputs: ['select', 'button'],
    },
    {
      url: '/integrations/ejudge/setup',
      slug: 'ejudge',
      expectedInputs: ['select', 'input', 'button'], // course + base_url + api_key
    },
  ];
  const probes = {};
  for (const t of targets) {
    await gotoSpa(page, t.url);
    await shot(page, `C-${t.slug}`);
    const probe = await probePage(page);
    if (probe.is404 || probe.isError) {
      probes[t.slug] = { status: 'fail', reason: probe.title };
      continue;
    }
    const inputs = await page.evaluate(() => ({
      inputs: document.querySelectorAll('input').length,
      selects: document.querySelectorAll('[role="combobox"], select').length,
      buttons: Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim()).filter(Boolean),
    }));
    probes[t.slug] = { status: 'ok', ...inputs };
  }
  const allOk = Object.values(probes).every((p) => p.status === 'ok');
  record(results, scenario, allOk ? 'pass' : 'partial', JSON.stringify(probes));
}

// ─── Scenario D: OAuth callback error states ───────────────────────────────
async function scenarioD(page, results) {
  const scenario = 'D: OAuth callback error states';
  console.log(`\n--- ${scenario} ---`);
  const cases = [
    { url: '/integrations/oauth/callback', slug: 'empty' },
    { url: '/integrations/oauth/callback?code=test&state=invalid', slug: 'invalid' },
    { url: '/integrations/oauth/callback?error=access_denied', slug: 'denied' },
  ];
  const probes = {};
  for (const c of cases) {
    await gotoSpa(page, c.url, 2500);
    await shot(page, `D-${c.slug}`);
    const probe = await probePage(page);
    const errBlock = await page.evaluate(() => {
      // The page has a card and renders one of three states: loading/ok/error.
      // We expect 'error' for our cases — look for AlertCircle / 'Ошибка' /
      // 'Попробовать заново' / 'отказал'.
      const bodyText = (document.body.innerText || '').toLowerCase();
      return {
        hasError: /отказ|ошибк|отсутств|параметр|неполн|access_denied/i.test(bodyText),
        hasRetry: /попробовать|retry|заново|подключить/i.test(bodyText),
        hasLoading: /завершаем|loading|зугружа/i.test(bodyText),
      };
    });
    probes[c.slug] = {
      crashed: probe.is404 || probe.isError,
      hasError: errBlock.hasError,
      hasRetry: errBlock.hasRetry,
      hasLoading: errBlock.hasLoading,
      bodyLen: probe.bodyLen,
    };
  }
  const noCrashes = Object.values(probes).every((p) => !p.crashed);
  const someError = Object.values(probes).some((p) => p.hasError);
  record(
    results,
    scenario,
    noCrashes && someError ? 'pass' : noCrashes ? 'partial' : 'fail',
    JSON.stringify(probes),
  );
}

// ─── Scenario E: LLM providers ─────────────────────────────────────────────
async function scenarioE(page, results) {
  const scenario = 'E: LLM admin pages';
  console.log(`\n--- ${scenario} ---`);
  const targets = [
    { url: '/admin/ai/providers', slug: 'providers' },
    { url: '/admin/ai/budgets', slug: 'budgets' },
    { url: '/admin/ai/cache', slug: 'cache' },
    { url: '/admin/ai/prompt-versions', slug: 'prompt-versions' },
  ];
  const probes = {};
  for (const t of targets) {
    await gotoSpa(page, t.url);
    await shot(page, `E-${t.slug}`);
    const probe = await probePage(page);
    probes[t.slug] = {
      crashed: probe.is404 || probe.isError || probe.errBoundary,
      h1: probe.h1,
      bodyLen: probe.bodyLen,
    };
  }

  // E-providers: try to open the edit modal on first provider row.
  await gotoSpa(page, '/admin/ai/providers');
  await page.waitForTimeout(1200);
  const editBtn = page.locator('[data-testid^="provider-row-"][data-testid$="-edit"]').first();
  const editAvail = await editBtn.count();
  let modalOpened = false;
  if (editAvail) {
    await editBtn.click();
    await page.waitForTimeout(800);
    modalOpened = await page.locator('[data-testid="provider-edit-modal"]').first().count() > 0;
    await shot(page, 'E-providers-edit-modal');
    // close via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  const noCrashes = Object.values(probes).every((p) => !p.crashed);
  record(
    results,
    scenario,
    noCrashes ? (modalOpened ? 'pass' : 'partial') : 'fail',
    JSON.stringify({ probes, modalOpened, editAvail }),
  );
}

// ─── Scenario F: Notifications ─────────────────────────────────────────────
async function scenarioF(page, results) {
  const scenario = 'F: Notifications admin';
  console.log(`\n--- ${scenario} ---`);
  const targets = [
    { url: '/admin/notifications/email', slug: 'email' },
    { url: '/admin/notifications/templates', slug: 'templates' },
    { url: '/admin/notifications/deliveries', slug: 'deliveries' },
    { url: '/admin/notifications/dlq', slug: 'dlq' },
  ];
  const probes = {};
  for (const t of targets) {
    await gotoSpa(page, t.url);
    await shot(page, `F-${t.slug}`);
    const probe = await probePage(page);
    probes[t.slug] = {
      crashed: probe.is404 || probe.isError || probe.errBoundary,
      h1: probe.h1,
      bodyLen: probe.bodyLen,
    };
  }

  // F-templates: there is no "Create" — only Edit on existing. Verify Edit
  // modal opens on the first template row.
  await gotoSpa(page, '/admin/notifications/templates');
  await page.waitForTimeout(1500);
  const firstRowEdit = page.locator('[data-testid^="template-row-"]').first().locator('button:has-text("Edit")').first();
  const tplBtnAvail = await firstRowEdit.count();
  let tplModalOpened = false;
  if (tplBtnAvail) {
    await firstRowEdit.click();
    await page.waitForTimeout(800);
    tplModalOpened = await page.locator('[role="dialog"]').first().count() > 0;
    await shot(page, 'F-templates-edit-modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // F-email: form fields present.
  await gotoSpa(page, '/admin/notifications/email');
  await page.waitForTimeout(1000);
  const emailForm = await page.evaluate(() => ({
    inputs: document.querySelectorAll('input').length,
    selects: document.querySelectorAll('[role="combobox"], select').length,
    switches: document.querySelectorAll('[role="switch"]').length,
  }));

  const noCrashes = Object.values(probes).every((p) => !p.crashed);
  record(
    results,
    scenario,
    noCrashes ? 'pass' : 'fail',
    JSON.stringify({ probes, emailForm, tplBtnAvail, tplModalOpened }),
  );
}

// ─── Scenario G: Webhooks ──────────────────────────────────────────────────
async function scenarioG(page, results) {
  const scenario = 'G: Webhooks admin';
  console.log(`\n--- ${scenario} ---`);
  await gotoSpa(page, '/admin/integrations/webhooks');
  await page.waitForTimeout(1500);
  await shot(page, 'G-01-webhooks-list');
  const probe = await probePage(page);
  if (probe.is404 || probe.isError) {
    record(results, scenario, 'fail', `crashed: ${probe.title}`);
    return;
  }

  // Filter widget — click the kind dropdown.
  const filterTrigger = page.locator('[role="combobox"]').first();
  const filterAvail = await filterTrigger.count();
  let filterOpened = false;
  if (filterAvail) {
    await filterTrigger.click();
    await page.waitForTimeout(500);
    filterOpened = (await page.locator('[role="option"]').count()) > 0;
    await shot(page, 'G-02-webhooks-filter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Pick stepik filter to exercise refetch.
  if (filterOpened) {
    await filterTrigger.click();
    await page.waitForTimeout(400);
    const opt = page.locator('[role="option"]:has-text("stepik")').first();
    if (await opt.count()) {
      await opt.click();
      await page.waitForTimeout(900);
      await shot(page, 'G-03-webhooks-filtered');
    }
  }

  record(
    results,
    scenario,
    filterAvail && filterOpened ? 'pass' : 'partial',
    JSON.stringify({ filterAvail, filterOpened, bodyLen: probe.bodyLen, h1: probe.h1 }),
  );
}

// ─── Scenario H: MOSS / plagiarism corpus ──────────────────────────────────
async function scenarioH(page, results) {
  const scenario = 'H: Plagiarism corpus';
  console.log(`\n--- ${scenario} ---`);
  await gotoSpa(page, '/admin/plagiarism-corpus');
  await page.waitForTimeout(1500);
  await shot(page, 'H-01-corpus');
  const probe = await probePage(page);
  if (probe.is404 || probe.isError) {
    record(results, scenario, 'fail', `crashed: ${probe.title}`);
    return;
  }
  const rebuildBtn = page.locator('[data-testid="plagiarism-corpus-rebuild"]').first();
  const rebuildAvail = await rebuildBtn.count();
  const rebuildDisabled = rebuildAvail ? await rebuildBtn.isDisabled() : null;
  record(
    results,
    scenario,
    rebuildAvail ? 'pass' : 'partial',
    JSON.stringify({ rebuildAvail, rebuildDisabled, bodyLen: probe.bodyLen, h1: probe.h1 }),
  );
}

// ─── Scenario I: Submission / plagiarism flow as teacher ───────────────────
async function scenarioI(browser, results) {
  const scenario = 'I: Plagiarism trigger (teacher)';
  console.log(`\n--- ${scenario} (separate teacher context) ---`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const issues = [];
  attachListeners(page, issues, scenario);
  try {
    await demoLogin(page, 'teacher');
  } catch (e) {
    await ctx.close();
    record(results, scenario, 'fail', `teacher login failed: ${e.message}`);
    return;
  }

  // First: open /courses, click first course card to find an assignment.
  await gotoSpa(page, '/courses');
  await page.waitForTimeout(1500);
  await shot(page, 'I-01-courses');
  const courseHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/courses/"]'));
    for (const a of links) {
      const h = a.getAttribute('href');
      if (h && h !== '/courses/new' && h !== '/courses/join' && /^\/courses\/[^/]+$/.test(h)) {
        return h;
      }
    }
    return null;
  });
  if (!courseHref) {
    results.issues.push(...issues);
    await ctx.close();
    record(results, scenario, 'partial', 'no course detail link found in demo data');
    return;
  }
  await gotoSpa(page, courseHref);
  await page.waitForTimeout(1500);
  await shot(page, 'I-02-course-detail');

  // From course detail, find an assignment link.
  const assignmentHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/assignments/"]'));
    for (const a of links) {
      const h = a.getAttribute('href');
      if (h && /^\/assignments\/[^/]+$/.test(h)) return h;
    }
    return null;
  });
  if (!assignmentHref) {
    results.issues.push(...issues);
    await ctx.close();
    record(results, scenario, 'partial', `no assignment link on ${courseHref}`);
    return;
  }
  await gotoSpa(page, assignmentHref);
  await page.waitForTimeout(2000);
  await shot(page, 'I-03-assignment-detail');
  const probe = await probePage(page);
  if (probe.is404 || probe.isError) {
    results.issues.push(...issues);
    await ctx.close();
    record(results, scenario, 'fail', `assignment crashed: ${probe.title}`);
    return;
  }

  // Click the "Плагиат" tab and find the "Запустить проверку" button.
  const plagTab = page.locator('[role="tab"]:has-text("Плагиат")').first();
  if (await plagTab.count()) {
    await plagTab.click();
    await page.waitForTimeout(800);
  }
  await shot(page, 'I-04-plagiarism-tab');
  const startBtn = page.locator('[data-testid="assignment-tab-plagiarism-start"]').first();
  const startAvail = await startBtn.count();
  const startDisabled = startAvail ? await startBtn.isDisabled() : null;

  // Also: navigate to /assignments/:id/plagiarism (full runs list page) and
  // open the "Запустить новую проверку" modal — verify it renders provider
  // select + corpus toggle + threshold slider, but DON'T submit.
  const assignmentId = assignmentHref.split('/').pop();
  await gotoSpa(page, `/assignments/${assignmentId}/plagiarism`);
  await page.waitForTimeout(1500);
  await shot(page, 'I-05-plagiarism-runs-list');
  const runsListProbe = await probePage(page);
  const openModalBtn = page.locator('[data-testid="plagiarism-run-create-open"]').first();
  let runsModalOpened = false;
  let modalProbe = null;
  if (await openModalBtn.count()) {
    await openModalBtn.click();
    await page.waitForTimeout(800);
    runsModalOpened = await page.locator('[data-testid="plagiarism-run-create-modal"]').first().count() > 0;
    if (runsModalOpened) {
      modalProbe = await page.evaluate(() => ({
        selects: document.querySelectorAll('[role="combobox"], select').length,
        switches: document.querySelectorAll('[role="switch"]').length,
        sliders: document.querySelectorAll('[role="slider"], input[type="range"]').length,
        hasSubmit: !!document.querySelector('[data-testid="plagiarism-run-create-submit"]'),
      }));
    }
    await shot(page, 'I-06-plagiarism-run-modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  results.issues.push(...issues);
  await ctx.close();

  const okHere = startAvail > 0 && runsListProbe && !runsListProbe.isError && runsModalOpened;
  record(
    results,
    scenario,
    okHere ? 'pass' : 'partial',
    JSON.stringify({
      courseHref,
      assignmentHref,
      startAvail,
      startDisabled,
      runsModalOpened,
      modalProbe,
    }),
  );
}

// ─── Driver ───────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const results = { scenarios: [], issues: [], startedAt: TIMESTAMP };

  // ── admin context ──
  const adminCtx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const adminPage = await adminCtx.newPage();
  attachListeners(adminPage, results.issues, 'admin-session');

  console.log('\n=== ADMIN demo-login-admin ===');
  try {
    await demoLogin(adminPage, 'admin');
  } catch (e) {
    console.log(`!! admin login failed: ${e.message}`);
    await adminCtx.close();
    await browser.close();
    return;
  }

  try { await scenarioA(adminPage, results); } catch (e) { record(results, 'A: Integration wizard', 'fail', `exc: ${e.message}`); }
  try { await scenarioB(adminPage, results); } catch (e) { record(results, 'B: Integration detail', 'fail', `exc: ${e.message}`); }
  try { await scenarioC(adminPage, results); } catch (e) { record(results, 'C: Provider setup pages', 'fail', `exc: ${e.message}`); }
  try { await scenarioD(adminPage, results); } catch (e) { record(results, 'D: OAuth callback error states', 'fail', `exc: ${e.message}`); }
  try { await scenarioE(adminPage, results); } catch (e) { record(results, 'E: LLM admin pages', 'fail', `exc: ${e.message}`); }
  try { await scenarioF(adminPage, results); } catch (e) { record(results, 'F: Notifications admin', 'fail', `exc: ${e.message}`); }
  try { await scenarioG(adminPage, results); } catch (e) { record(results, 'G: Webhooks admin', 'fail', `exc: ${e.message}`); }
  try { await scenarioH(adminPage, results); } catch (e) { record(results, 'H: Plagiarism corpus', 'fail', `exc: ${e.message}`); }
  await adminCtx.close();

  // ── teacher context ──
  try { await scenarioI(browser, results); } catch (e) { record(results, 'I: Plagiarism trigger (teacher)', 'fail', `exc: ${e.message}`); }

  await browser.close();

  // ── summary ──
  const counts = { pass: 0, partial: 0, fail: 0 };
  for (const s of results.scenarios) counts[s.status] = (counts[s.status] ?? 0) + 1;
  console.log('\n\n========== SUMMARY ==========');
  console.log(`  scenarios: pass=${counts.pass} partial=${counts.partial} fail=${counts.fail}`);
  for (const s of results.scenarios) {
    const marker = s.status === 'pass' ? '+' : s.status === 'partial' ? '~' : '-';
    console.log(`    [${marker}] ${s.scenario}: ${s.status}`);
  }
  console.log(`  issues (post-noise): ${results.issues.length}`);
  const byKind = {};
  for (const i of results.issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  for (const [k, v] of Object.entries(byKind)) console.log(`    ${k}: ${v}`);
  for (const i of results.issues.slice(0, 30)) {
    console.log(`    - [${i.kind}] ${i.scenario} ${i.route}: ${(i.msg || '').slice(0, 160)}`);
  }

  fs.writeFileSync(`${OUT_DIR}/_smoke.json`, JSON.stringify(results, null, 2));
  console.log(`\n  → ${OUT_DIR}/_smoke.json`);
})();
