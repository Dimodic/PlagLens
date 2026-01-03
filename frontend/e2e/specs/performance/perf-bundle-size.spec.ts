/**
 * Bundle size budget: dist/assets/index-*.js < 800 KB gzipped.
 *
 * This test reads the filesystem; it should be run after `npm run build`.
 * If `dist/` is missing, we skip with a clear annotation.
 */
import { test, expect } from '@playwright/test';
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST = resolve(__dirname, '..', '..', '..', 'dist', 'assets');
const BUDGET_GZ = 800 * 1024;

test.describe('Bundle size', () => {
  test('main JS bundle gzipped < 800 KB', async () => {
    let entries: string[];
    try {
      entries = await readdir(DIST);
    } catch {
      test.skip(true, `dist/assets missing (run \`npm run build\`)`);
      return;
    }
    const indexJs = entries.find((f) => /^index-.*\.js$/.test(f));
    if (!indexJs) {
      test.skip(true, 'no index-*.js found in dist/assets');
      return;
    }
    const buf = await readFile(resolve(DIST, indexJs));
    const gz = gzipSync(buf);
    console.log(`bundle ${indexJs}: raw=${buf.length}, gzip=${gz.length}`);
    expect(gz.length).toBeLessThan(BUDGET_GZ);
  });

  test('total JS gzipped < 1.5 MB across all chunks', async () => {
    let entries: string[];
    try {
      entries = await readdir(DIST);
    } catch {
      test.skip(true, `dist/assets missing (run \`npm run build\`)`);
      return;
    }
    const jsFiles = entries.filter((f) => f.endsWith('.js'));
    if (jsFiles.length === 0) {
      test.skip(true, 'no js files in dist/assets');
      return;
    }
    let total = 0;
    for (const f of jsFiles) {
      const buf = await readFile(resolve(DIST, f));
      total += gzipSync(buf).length;
    }
    console.log(`total gzip JS = ${total}`);
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
  });

  test('largest single asset is below 1 MB raw (warn-level)', async () => {
    let entries: string[];
    try {
      entries = await readdir(DIST);
    } catch {
      test.skip(true, `dist missing`);
      return;
    }
    // Skip source maps (.map) — they're never shipped to users.
    const shippable = entries.filter((f) => !f.endsWith('.map'));
    let max = 0;
    let maxFile = '';
    for (const f of shippable) {
      const s = await stat(resolve(DIST, f));
      if (s.size > max) {
        max = s.size;
        maxFile = f;
      }
    }
    if (max >= 1024 * 1024) {
      test.info().annotations.push({
        type: 'warn',
        description: `largest shipped dist asset is ${maxFile} = ${max} bytes (>1 MB)`,
      });
    }
    // Anything over 5 MB raw is a hard fail (bundle bloat).
    expect(max).toBeLessThan(5 * 1024 * 1024);
  });
});
