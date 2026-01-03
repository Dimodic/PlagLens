/**
 * Take screenshots of redesigned pages.
 *
 * The dev container keeps access tokens in memory; full reloads via goto()
 * drop the token. So we click "Demo" buttons, then drive route changes via
 * `history.pushState + popstate` so React Router handles it WITHOUT a page
 * reload — preserving the token.
 */
const { chromium } = require('playwright-core');

const VIEWPORT = { width: 1280, height: 900 };
const OUT = '/tmp/redesign-shots';

async function navigateSpa(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}

async function captureRole({ role, testId, urls }) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/(favicon|WebSocket|5174|net::ERR|401)/i.test(t)) return;
    errors.push('console.error ' + t);
  });

  await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
  await page.click(`[data-testid="demo-login-${testId}"]`, { timeout: 8000 });
  await page.waitForURL((u) => !u.toString().includes('/demo'), { timeout: 10_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  console.log(`[${role}] auth landed at`, page.url());

  for (const { slug, url } of urls) {
    try {
      await navigateSpa(page, url);
      const final = await page.url();
      const ok = !final.includes('/login');
      await page.screenshot({
        path: `${OUT}/${role}-${slug}.png`,
        fullPage: true,
      });
      console.log(`  ${role}/${slug.padEnd(22)} ${ok ? '✓' : '✗'}  ${final}`);
    } catch (e) {
      console.log(`  ${role}/${slug} FAIL`, e.message);
    }
  }

  // Sidebar probe at 1280x900
  try {
    await navigateSpa(page, '/integrations');
  } catch {}
  const sidebar = page.locator('[data-testid="app-sidebar"]').first();
  if (await sidebar.count()) {
    const railBox = await sidebar.boundingBox();
    await page.screenshot({
      path: `${OUT}/${role}-sidebar-rail.png`,
      clip: { x: 0, y: 0, width: 80, height: VIEWPORT.height },
    });
    await sidebar.hover({ position: { x: 30, y: 200 } });
    await page.waitForTimeout(300);
    const drawerBox = await page
      .locator('[data-testid="app-sidebar-drawer"]')
      .first()
      .boundingBox();
    await page.screenshot({
      path: `${OUT}/${role}-sidebar-drawer.png`,
      clip: { x: 0, y: 0, width: 320, height: VIEWPORT.height },
    });
    console.log(
      `  ${role} sidebar: rail=${railBox?.width}px → drawer=${drawerBox?.width}px on hover`,
    );
  }

  console.log(`[${role}] errors: ${errors.length}`);
  errors.slice(0, 10).forEach((e) => console.log('   -', e));
  await browser.close();
}

(async () => {
  const teacherUrls = [
    { slug: 'home', url: '/' },
    { slug: 'courses', url: '/courses' },
    { slug: 'integrations', url: '/integrations' },
    { slug: 'imports', url: '/imports' },
    { slug: 'integrations-wizard', url: '/integrations/wizard' },
    { slug: 'settings', url: '/settings' },
    { slug: 'me-assignments', url: '/me/assignments' },
    { slug: 'me-submissions', url: '/me/submissions' },
    { slug: 'notifications', url: '/notifications' },
  ];
  const adminUrls = [
    { slug: 'home', url: '/' },
    { slug: 'admin-overview', url: '/admin/overview' },
    { slug: 'admin-users', url: '/admin/users' },
    { slug: 'admin-integrations', url: '/admin/integrations' },
    { slug: 'admin-audit', url: '/admin/audit' },
    { slug: 'admin-tenants', url: '/admin/tenants' },
  ];
  const studentUrls = [
    { slug: 'home', url: '/' },
    { slug: 'me-assignments', url: '/me/assignments' },
    { slug: 'me-submissions', url: '/me/submissions' },
    { slug: 'me-grades', url: '/me/grades' },
    { slug: 'notifications', url: '/notifications' },
  ];

  await captureRole({ role: 'teacher', testId: 'teacher', urls: teacherUrls });
  await captureRole({ role: 'admin', testId: 'admin', urls: adminUrls });
  await captureRole({ role: 'student', testId: 'student1', urls: studentUrls });
})();
