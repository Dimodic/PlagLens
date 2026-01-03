// Paste into DevTools → Console on any Kaggle page (after CAPTCHA passed).
// Collects body/h1-h3/button/input/card/nav-item computed styles + the brand
// colour, then puts a JSON blob into the clipboard so you can paste it back.
// Run on /competitions, /datasets, /code (notebooks), /learn — the more pages
// the better. Each run appends to window.__kaggleProbe.
(() => {
  const cs = (el, ...keys) => {
    if (!el) return null;
    const c = getComputedStyle(el);
    const out = {};
    keys.forEach((k) => (out[k] = c[k]));
    return out;
  };

  const pickFirst = (selectors) => {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return { el, sel: s };
    }
    return { el: null, sel: null };
  };

  const button = pickFirst([
    'button.km-button',                 // Kaggle's own
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

  const navItem = pickFirst([
    'header a[href]',
    'nav a[href]',
  ]);

  const out = {
    url: location.href,
    documentFontSize: getComputedStyle(document.documentElement).fontSize,
    body: cs(
      document.body,
      'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'color', 'backgroundColor',
    ),
    h1: cs(document.querySelector('h1'),
      'fontSize', 'fontWeight', 'lineHeight', 'fontFamily'),
    h2: cs(document.querySelector('h2'),
      'fontSize', 'fontWeight', 'lineHeight'),
    h3: cs(document.querySelector('h3'),
      'fontSize', 'fontWeight', 'lineHeight'),
    button: button.el && {
      sel: button.sel,
      text: button.el.innerText.trim().slice(0, 40),
      ...cs(button.el,
        'fontSize', 'fontWeight', 'height', 'padding', 'borderRadius',
        'backgroundColor', 'color', 'textTransform', 'letterSpacing'),
    },
    input: input.el && {
      sel: input.sel,
      ...cs(input.el,
        'fontSize', 'height', 'padding', 'borderRadius', 'border', 'backgroundColor'),
    },
    card: card.el && {
      sel: card.sel,
      ...cs(card.el,
        'padding', 'borderRadius', 'border', 'backgroundColor', 'boxShadow', 'gap'),
    },
    navItem: navItem.el && {
      sel: navItem.sel,
      text: navItem.el.innerText.trim().slice(0, 30),
      ...cs(navItem.el, 'fontSize', 'fontWeight', 'padding', 'color', 'textTransform'),
    },
    // Find the Kaggle brand cyan in any element's bg/border/color
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

  window.__kaggleProbe = window.__kaggleProbe || [];
  window.__kaggleProbe.push(out);
  console.log('=== current page ===', out);
  console.log('=== full collection (', window.__kaggleProbe.length, 'pages) ===');
  console.log(JSON.stringify(window.__kaggleProbe, null, 2));
  // Try to copy to clipboard
  navigator.clipboard
    .writeText(JSON.stringify(window.__kaggleProbe, null, 2))
    .then(() => console.log('%c✔ скопировано в буфер обмена — присылай', 'color:green;font-weight:bold'))
    .catch((e) => console.log('clipboard failed (' + e.message + '): скопируй JSON вручную из лога выше'));
})();
