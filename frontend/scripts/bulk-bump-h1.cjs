/**
 * One-shot bulk update: every `<h1 className="text-2xl font-semibold tracking-tight"`
 * (the canonical "page title" pattern across the project) becomes
 * `<h1 className="text-3xl font-bold tracking-tight"` so it matches the
 * 36px / 700 baseline measured in our reference product.
 *
 * Run from frontend/: `node scripts/bulk-bump-h1.cjs`
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src');
const before = 'className="text-2xl font-semibold tracking-tight"';
const after = 'className="text-3xl font-bold tracking-tight"';

function walk(dir) {
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      n += walk(full);
      continue;
    }
    if (!name.endsWith('.tsx')) continue;
    const txt = fs.readFileSync(full, 'utf8');
    if (!txt.includes(before)) continue;
    // Only touch occurrences inside an <h1> open-tag — never paragraphs etc.
    const updated = txt.replace(
      /(<h1[^>]*?\s)className="text-2xl font-semibold tracking-tight"/g,
      `$1className="text-3xl font-bold tracking-tight"`,
    );
    if (updated === txt) continue;
    fs.writeFileSync(full, updated);
    const hits = (txt.match(/<h1[^>]*?className="text-2xl font-semibold tracking-tight"/g) || []).length;
    console.log(`  ${path.relative(root, full)}  -- ${hits} h1`);
    n += hits;
  }
  return n;
}

const total = walk(root);
console.log(`\n=== updated ${total} h1 page-titles ===`);
