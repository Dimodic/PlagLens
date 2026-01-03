/**
 * Headed Kaggle inspector — runs on the Windows host (NOT inside docker) so
 * a real visible Chromium window opens. You pass Cloudflare CAPTCHA manually,
 * navigate to a few Kaggle pages, then press Enter in this terminal — the
 * script collects computed styles + colour samples and writes the result to
 * `kaggle-probe.json` next to itself.
 *
 * How to run from the project root:
 *   cd frontend
 *   node scripts/inspect-kaggle-headed.cjs
 *
 * Defaults to opening competitions/datasets/learn; you can navigate anywhere
 * inside the same window — the snapshot is taken on whatever the page is at
 * the moment you hit Enter.
 */
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { chromium } = require('playwright-core');

const CHROMIUM = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright',
  'chromium-1217',
  'chrome-win64',
  'chrome.exe',
);

if (!fs.existsSync(CHROMIUM)) {
  console.error('Chromium not found at', CHROMIUM);
  console.error('Run `npx playwright install chromium` first.');
  process.exit(1);
}

function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close();
      resolve(a);
    });
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: false,
    args: ['--start-maximized'],
  });
  const ctx = await browser.newContext({
    viewport: null, // use full window
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  await page.goto('https://www.kaggle.com/competitions');
  console.log('\n>>> Pass any Cloudflare CAPTCHA, navigate to /competitions /datasets /learn');
  console.log('>>> ENTER in this terminal — script will capture the CURRENT page each time');
  console.log('>>> Type `done` to finish and write the JSON\n');

  const collection = [];

  while (true) {
    const ans = await ask('press Enter to capture (or `done` to finish): ');
    if (ans.trim().toLowerCase() === 'done') break;

    const result = await page.evaluate(() => {
      const cs = (el, ...keys) => {
        if (!el) return null;
        const c = getComputedStyle(el);
        const out = {};
        keys.forEach((k) => (out[k] = c[k]));
        return out;
      };
      const pickFirst = (sels) => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el) return { el, sel: s };
        }
        return { el: null, sel: null };
      };
      const button = pickFirst([
        'button.km-button',
        'button[type="submit"]',
        'main button:not([aria-hidden])',
        'button:not([aria-hidden])',
      ]);
      const input = pickFirst([
        'input[type="search"]',
        'input[type="text"]',
        'input:not([type])',
      ]);
      const card = pickFirst([
        '[class*="card" i]:not([class*="header" i])',
        'article',
        'main > div > div',
      ]);
      const navItem = pickFirst(['header a[href]', 'nav a[href]']);
      return {
        url: location.href,
        documentFontSize: getComputedStyle(document.documentElement).fontSize,
        body: cs(document.body, 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'color', 'backgroundColor'),
        h1: cs(document.querySelector('h1'), 'fontSize', 'fontWeight', 'lineHeight', 'fontFamily'),
        h2: cs(document.querySelector('h2'), 'fontSize', 'fontWeight', 'lineHeight'),
        h3: cs(document.querySelector('h3'), 'fontSize', 'fontWeight', 'lineHeight'),
        button: button.el && {
          sel: button.sel,
          text: button.el.innerText.trim().slice(0, 40),
          ...cs(button.el, 'fontSize', 'fontWeight', 'height', 'padding', 'borderRadius',
            'backgroundColor', 'color', 'textTransform', 'letterSpacing'),
        },
        input: input.el && {
          sel: input.sel,
          ...cs(input.el, 'fontSize', 'height', 'padding', 'borderRadius', 'border', 'backgroundColor'),
        },
        card: card.el && {
          sel: card.sel,
          ...cs(card.el, 'padding', 'borderRadius', 'border', 'backgroundColor', 'boxShadow', 'gap'),
        },
        navItem: navItem.el && {
          sel: navItem.sel,
          text: navItem.el.innerText.trim().slice(0, 30),
          ...cs(navItem.el, 'fontSize', 'fontWeight', 'padding', 'color', 'textTransform'),
        },
        brandSamples: (() => {
          const targets = document.querySelectorAll('button, a, [class*="primary" i], [class*="blue" i]');
          const seen = new Set();
          const arr = [];
          for (const el of targets) {
            const c = getComputedStyle(el);
            for (const prop of ['color', 'backgroundColor', 'borderColor']) {
              const v = c[prop];
              if (v && !v.includes('rgba(0, 0, 0, 0)') && !seen.has(v) && /rgb/.test(v)) {
                seen.add(v);
                if (arr.length < 12) arr.push({ tag: el.tagName, prop, value: v });
              }
            }
          }
          return arr;
        })(),
      };
    });

    collection.push(result);
    console.log(`  captured ${result.url}  (${collection.length} pages so far)`);

    // also dump a screenshot
    await page.screenshot({
      path: path.join(__dirname, `kaggle-shot-${collection.length}.png`),
      fullPage: false,
    });
  }

  const outPath = path.join(__dirname, 'kaggle-probe.json');
  fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));
  console.log(`\n✔ wrote ${collection.length} pages to ${outPath}`);
  await browser.close();
})();
