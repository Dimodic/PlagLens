/**
 * Bulk-bump section H2 headings to 20px / 700 to match the measured baseline.
 * Patterns updated:
 *   text-lg font-medium          → text-xl font-bold
 *   text-lg font-medium tracking-tight → text-xl font-bold tracking-tight
 *   text-base font-semibold      → text-xl font-bold (smallest cases)
 *   text-base font-medium        → text-xl font-bold
 *
 * Only changes attribute on <h2 ...> opening tags; leaves p / div / span etc.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src');

const SUBS = [
  // (matcher inside h2 className, replacement)
  [/text-lg\s+font-medium\s+tracking-tight/, 'text-xl font-bold tracking-tight'],
  [/text-lg\s+font-medium/,                  'text-xl font-bold'],
  [/text-base\s+font-semibold/,              'text-xl font-bold'],
  [/text-base\s+font-medium/,                'text-xl font-bold'],
];

function tweakH2(line) {
  // Only touch the className value inside the FIRST <h2 ... > opener on the
  // line (most JSX in this project lives on one line per heading).
  return line.replace(/(<h2\b[^>]*?className=")([^"]+)(")/g, (_, pre, cls, post) => {
    let newCls = cls;
    for (const [re, sub] of SUBS) {
      newCls = newCls.replace(re, sub);
    }
    return pre + newCls + post;
  });
}

function walk(dir) {
  let touched = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      touched += walk(full);
      continue;
    }
    if (!name.endsWith('.tsx')) continue;
    const txt = fs.readFileSync(full, 'utf8');
    const lines = txt.split('\n');
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('<h2')) {
        const next = tweakH2(lines[i]);
        if (next !== lines[i]) {
          lines[i] = next;
          changed = true;
        }
      }
    }
    if (!changed) continue;
    fs.writeFileSync(full, lines.join('\n'));
    console.log('  updated:', path.relative(root, full));
    touched++;
  }
  return touched;
}

const n = walk(root);
console.log(`\n=== updated ${n} files ===`);
