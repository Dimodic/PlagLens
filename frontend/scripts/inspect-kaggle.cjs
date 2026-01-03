/**
 * Real measurement of Kaggle's UI properties — opens the live site in
 * Chromium, inspects computed styles + screenshots a few key surfaces.
 * Compares to current PlagLens values so we know exactly what to change.
 */
const { chromium } = require('playwright-core');

const KAGGLE_URLS = [
  'https://www.kaggle.com/competitions',
  'https://www.kaggle.com/datasets',
];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  for (const url of KAGGLE_URLS) {
    console.log(`\n=========== ${url} ===========`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log('GOTO FAILED:', e.message);
      continue;
    }

    const measurements = await page.evaluate(() => {
      const cs = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const c = getComputedStyle(el);
        return {
          fontSize: c.fontSize,
          fontWeight: c.fontWeight,
          fontFamily: c.fontFamily.split(',')[0].replace(/['"]/g, ''),
          lineHeight: c.lineHeight,
          color: c.color,
          height: c.height,
          padding: c.padding,
          borderRadius: c.borderRadius,
          background: c.backgroundColor,
          border: c.border,
        };
      };

      // Find a button + input + card
      const btn = document.querySelector('button:not([aria-hidden="true"]):not([disabled])');
      const input = document.querySelector('input[type="text"], input[type="search"], input:not([type])');
      const card =
        document.querySelector('[class*="Card"], [data-testid*="card" i], article, .card');
      const navItem =
        document.querySelector('nav a, [role="navigation"] a, header a');
      const link = document.querySelector('main a');

      return {
        body: cs('body'),
        h1: cs('h1'),
        h2: cs('h2'),
        h3: cs('h3'),
        button: btn
          ? {
              ...{
                fontSize: getComputedStyle(btn).fontSize,
                fontWeight: getComputedStyle(btn).fontWeight,
                height: getComputedStyle(btn).height,
                padding: getComputedStyle(btn).padding,
                borderRadius: getComputedStyle(btn).borderRadius,
                background: getComputedStyle(btn).backgroundColor,
                color: getComputedStyle(btn).color,
              },
              text: btn.innerText.trim().slice(0, 30),
            }
          : null,
        input: input
          ? {
              fontSize: getComputedStyle(input).fontSize,
              height: getComputedStyle(input).height,
              padding: getComputedStyle(input).padding,
              borderRadius: getComputedStyle(input).borderRadius,
              border: getComputedStyle(input).border,
              background: getComputedStyle(input).backgroundColor,
            }
          : null,
        card: card
          ? {
              padding: getComputedStyle(card).padding,
              borderRadius: getComputedStyle(card).borderRadius,
              background: getComputedStyle(card).backgroundColor,
              border: getComputedStyle(card).border,
              boxShadow: getComputedStyle(card).boxShadow,
            }
          : null,
        navItem: navItem
          ? {
              fontSize: getComputedStyle(navItem).fontSize,
              fontWeight: getComputedStyle(navItem).fontWeight,
              padding: getComputedStyle(navItem).padding,
              color: getComputedStyle(navItem).color,
            }
          : null,
        link: link ? cs('main a') : null,
        pageBackground: getComputedStyle(document.body).backgroundColor,
        documentFontSize: getComputedStyle(document.documentElement).fontSize,
        // Pull primary brand colour from CSS vars if exposed
        cssVars: (() => {
          const root = document.documentElement;
          const styles = getComputedStyle(root);
          const out = {};
          for (let i = 0; i < styles.length; i++) {
            const name = styles[i];
            if (name.startsWith('--') && /color|primary|brand|background|font/i.test(name)) {
              const val = styles.getPropertyValue(name).trim();
              if (val) out[name] = val;
            }
          }
          return out;
        })(),
      };
    });

    console.log(JSON.stringify(measurements, null, 2));
    const safe = url.replace(/[^\w]+/g, '_');
    await page.screenshot({ path: `/tmp/kaggle-${safe}.png`, fullPage: false });
  }

  await browser.close();
})();
