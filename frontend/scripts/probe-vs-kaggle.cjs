/**
 * Compare our key typography metrics against the captured Kaggle baseline.
 * Goal: at the end of the run, every "our" column should be within +/- 1px
 * of the "Kaggle" column for the equivalent element.
 */
const { chromium } = require('playwright-core');
const BASE = 'http://host.docker.internal:5173';

const KAGGLE = {
  bodyFontSize: 16,
  bodyFontFamily: 'Inter',
  h1FontSize: 36,
  h1FontWeight: 700,
  h1LineHeight: 44,
  h2FontSize: 20,
  h2FontWeight: 700,
  h2LineHeight: 24,
};

function px(s) {
  return parseFloat(s);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Log in as Гopденко (the role with content on every page).
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="demo-login-teacher"]');
  await page.waitForURL((u) => !u.toString().endsWith('/demo'), { timeout: 10000 });

  const sample = async (path) => {
    await page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    return page.evaluate(() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const body = cs(document.body);
      const h1 = cs(document.querySelector('h1'));
      const h2 = cs(document.querySelector('h2'));
      const h3 = cs(document.querySelector('h3'));
      const button = cs(document.querySelector('button:not([disabled])'));
      const input = cs(document.querySelector('input'));
      return {
        body: body && {
          fontSize: body.fontSize,
          fontFamily: body.fontFamily.split(',')[0].replace(/['"]/g, ''),
        },
        h1: h1 && {
          fontSize: h1.fontSize, fontWeight: h1.fontWeight, lineHeight: h1.lineHeight,
        },
        h2: h2 && {
          fontSize: h2.fontSize, fontWeight: h2.fontWeight, lineHeight: h2.lineHeight,
        },
        h3: h3 && {
          fontSize: h3.fontSize, fontWeight: h3.fontWeight,
        },
        button: button && { height: button.height, fontSize: button.fontSize },
        input: input && { height: input.height, fontSize: input.fontSize },
      };
    });
  };

  const home = await sample('/');
  const courses = await sample('/courses');
  const integrations = await sample('/integrations');

  console.log('\n=========== OUR PROJECT (Kaggle target) ===========');
  console.log('--- /  (dashboard) ---');
  console.log(home);
  console.log('--- /courses ---');
  console.log(courses);
  console.log('--- /integrations ---');
  console.log(integrations);

  console.log('\n=========== DIFF vs KAGGLE ===========');
  const cmp = (label, ours, target, tol = 1) => {
    const diff = Math.abs(ours - target);
    const ok = diff <= tol;
    console.log(`  ${label.padEnd(22)} ours=${ours}px  kaggle=${target}px  ${ok ? '✓' : '✗ Δ=' + diff.toFixed(1)}`);
  };
  if (home.body) {
    cmp('body fontSize', px(home.body.fontSize), KAGGLE.bodyFontSize);
    const ff = home.body.fontFamily;
    console.log(`  body fontFamily        ours="${ff}"  kaggle="${KAGGLE.bodyFontFamily}"  ${ff.includes(KAGGLE.bodyFontFamily) ? '✓' : '✗'}`);
  }
  // h1 might be on /courses (the "Курсы и задания" page)
  for (const [name, s] of [['home', home], ['courses', courses], ['integrations', integrations]]) {
    if (s.h1) {
      console.log(`\n  -- h1 found on ${name} --`);
      cmp('h1 fontSize', px(s.h1.fontSize), KAGGLE.h1FontSize, 2);
      cmp('h1 fontWeight', parseInt(s.h1.fontWeight), KAGGLE.h1FontWeight, 0);
      cmp('h1 lineHeight', px(s.h1.lineHeight), KAGGLE.h1LineHeight, 2);
      break;
    }
  }
  for (const [name, s] of [['home', home], ['courses', courses], ['integrations', integrations]]) {
    if (s.h2) {
      console.log(`\n  -- h2 found on ${name} --`);
      cmp('h2 fontSize', px(s.h2.fontSize), KAGGLE.h2FontSize, 2);
      cmp('h2 fontWeight', parseInt(s.h2.fontWeight), KAGGLE.h2FontWeight, 0);
      cmp('h2 lineHeight', px(s.h2.lineHeight), KAGGLE.h2LineHeight, 2);
      break;
    }
  }

  await page.screenshot({ path: '/tmp/post-kaggle-tune.png', fullPage: true });
  await browser.close();
})();
