/**
 * STRICT verification: simulate exactly what the user does in their browser.
 *   - hit the HOST-published port 5174 (not in-container 5173)
 *   - disable cache (so a stale JS bundle in storage cannot fool us)
 *   - log in as Гopденко (gordenko.mk@edu.hse.ru)
 *   - on /integrations, find the SPECIFICALLY Stepik card (not the first
 *     match), inspect its «Открыть» link, click it, capture the result.
 */
const { chromium } = require('playwright-core');
const BASE = 'http://host.docker.internal:5174';
const SHOTS = '/tmp';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    bypassCSP: true,
  });
  // disable cache so a stale bundle can't lie to us
  await ctx.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'cache-control': 'no-cache' };
    route.continue({ headers });
  });

  const page = await ctx.newPage();
  const issues = [];
  page.on('response', (r) => {
    if (
      r.url().includes('/api/') &&
      r.status() >= 400 &&
      !r.url().endsWith('/auth/refresh')
    ) {
      issues.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });
  page.on('pageerror', (e) => issues.push('PAGEERR ' + e.message));

  // 1. real /login as Гopденко — using stable test-id selectors
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('[data-testid="login-email"]', 'gordenko.mk@edu.hse.ru');
  await page.fill('[data-testid="login-password"]', 'changeme');
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL((u) => !u.toString().endsWith('/login'), { timeout: 15000 });
  console.log('logged in:', page.url());
  await page.screenshot({ path: `${SHOTS}/host-0-after-login.png`, fullPage: true });

  // 2. SPA-navigate to /integrations (preserves the in-memory token from
  //    the login response — full goto would force a refresh-token round trip)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/integrations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500); // let cards finish loading
  console.log('on /integrations:', page.url());
  await page.screenshot({ path: `${SHOTS}/host-1-list.png`, fullPage: true });

  // 3. enumerate card buttons rigorously
  const cards = await page.locator('[data-testid^="integration-card"]').all();
  console.log('card data-testids found:', cards.length);

  // 4. find the Stepik card by text
  const stepikRoot = page
    .locator('div')
    .filter({ has: page.locator('text=/Stepik/') })
    .filter({ has: page.locator('text=/Открыть/') })
    .first();

  const stepikRootCount = await stepikRoot.count();
  console.log('stepik card found:', stepikRootCount);

  // 5. find «Открыть» specifically inside the Stepik card
  const allOpens = await page
    .locator('a:has-text("Открыть"), button:has-text("Открыть")')
    .all();
  console.log('\nALL «Открыть» elements:');
  for (let i = 0; i < allOpens.length; i++) {
    const el = allOpens[i];
    const tag = await el.evaluate((n) => n.tagName);
    const href = await el.getAttribute('href').catch(() => null);
    const txt = await el.innerText().catch(() => '');
    const cardText = await el
      .locator('xpath=ancestor::*[contains(@class,"rounded")][1]')
      .innerText()
      .catch(() => '(no card text)');
    console.log(
      `  [${i}] <${tag}> href=${href} txt="${txt.replace(/\s+/g, ' ').slice(0, 30)}"`,
    );
    console.log(`        card-snippet="${cardText.replace(/\s+/g, ' ').slice(0, 80)}"`);
  }

  // 6. find specifically the Stepik «Открыть» (the one whose card mentions Stepik)
  let stepikOpen = null;
  for (const el of allOpens) {
    const cardText = await el
      .locator('xpath=ancestor::*[contains(@class,"rounded")][1]')
      .innerText()
      .catch(() => '');
    if (/Stepik/i.test(cardText) && !/Yandex/i.test(cardText)) {
      stepikOpen = el;
      break;
    }
  }

  if (!stepikOpen) {
    console.log('\n!!! Stepik «Открыть» not found at all');
    await browser.close();
    return;
  }

  const href = await stepikOpen.getAttribute('href').catch(() => null);
  console.log(`\nStepik «Открыть» href = ${href}`);

  // 7. click it and observe
  await Promise.all([
    page.waitForURL((u) => u.toString() !== `${BASE}/integrations`, { timeout: 8000 }).catch(() => {}),
    stepikOpen.click(),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  const url = page.url();
  const title = await page.title();
  const h1 = await page
    .locator('h1, h2')
    .first()
    .innerText({ timeout: 1500 })
    .catch(() => '(no heading)');
  const body = await page.textContent('body').catch(() => '');
  const is404 =
    body.includes('Страница не найдена') ||
    /\bстраница не найдена\b/i.test(body) ||
    />404</.test(body);
  console.log(`\nresult:`);
  console.log(`  url     = ${url}`);
  console.log(`  title   = ${title}`);
  console.log(`  h1      = ${h1.replace(/\s+/g, ' ').slice(0, 80)}`);
  console.log(`  is 404? = ${is404 ? 'YES (BAD)' : 'no (GOOD)'}`);
  await page.screenshot({ path: `${SHOTS}/host-2-after-click.png`, fullPage: true });

  console.log('\nHTTP issues:');
  if (issues.length === 0) console.log('  (none)');
  else issues.forEach((i) => console.log('  • ' + i));

  await browser.close();
})();
