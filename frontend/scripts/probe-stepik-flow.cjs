/**
 * Two scenarios that could give the user the "404 when opening Stepik"
 * complaint, after the admin has already saved Client ID + Client Secret:
 *
 *   A. admin / oauth providers — click Stepik card "Изменить" → expect dialog
 *   B. teacher — Подключить → Stepik → expect /integrations/stepik/setup
 *
 * Both report any 4xx the page surfaces.
 */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:5173';
const SHOTS = '/tmp';

async function login(page, role) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click(`[data-testid="demo-login-${role}"]`);
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // -------- Scenario A: admin opens OAuth providers and clicks Stepik --------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const issues = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400 && !r.url().endsWith('/auth/refresh')) {
        issues.push(`HTTP ${r.status()} ${r.url()}`);
      }
    });

    await login(page, 'admin');
    console.log('A.0 logged in as admin');

    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin/integrations/oauth-providers');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/flow-A1-providers-list.png`, fullPage: true });

    // Click "Изменить" on Stepik (since it's already configured)
    const editBtn = page.locator('[data-testid="oauth-edit-stepik"]');
    if (await editBtn.count()) {
      await editBtn.click();
      await page.waitForTimeout(800);
      const dlg = await page.locator('[role="dialog"]').count();
      console.log(`A.1 click 'Изменить Stepik' -> dialog open=${dlg}`);
      await page.screenshot({ path: `${SHOTS}/flow-A2-edit-dialog.png`, fullPage: true });
    } else {
      console.log('A.1 no edit button found');
    }

    console.log('A.* HTTP issues:', issues);
    await ctx.close();
  }

  // -------- Scenario B: teacher tries to connect Stepik --------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const issues = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400 && !r.url().endsWith('/auth/refresh')) {
        issues.push(`HTTP ${r.status()} ${r.url()}`);
      }
    });

    await login(page, 'teacher');
    console.log('\nB.0 logged in as teacher');

    await page.evaluate(() => {
      window.history.pushState({}, '', '/integrations');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/flow-B1-integrations.png`, fullPage: true });

    // Open dropdown, click Stepik
    await page.click('[data-testid="integrations-new-button"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/flow-B2-dropdown.png`, fullPage: true });

    await page.click('[data-testid="connect-stepik"]');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    console.log(`B.1 after click Stepik -> ${page.url()}`);
    const title = await page.title();
    const h1 = await page
      .locator('h1, h2')
      .first()
      .innerText({ timeout: 1500 })
      .catch(() => '(no heading)');
    console.log(`     title=${title}  h1='${h1.replace(/\s+/g, ' ').slice(0, 60)}'`);
    await page.screenshot({ path: `${SHOTS}/flow-B3-stepik-setup.png`, fullPage: true });

    console.log('B.* HTTP issues:', issues);
    await ctx.close();
  }

  await browser.close();
})();
