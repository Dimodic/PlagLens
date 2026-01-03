// Manually run Tailwind compile pipeline like @tailwindcss/vite does.
const path = require('path');
const fs = require('fs');
const { compile, Features } = require('@tailwindcss/node');
const { Scanner } = require('@tailwindcss/oxide');

(async () => {
  const cssPath = '/app/src/styles/global.css';
  const cssText = fs.readFileSync(cssPath, 'utf8');
  console.log('=== Source CSS bytes:', cssText.length);

  const compiler = await compile(cssText, {
    base: path.dirname(cssPath),
    shouldRewriteUrls: true,
    onDependency: (d) => console.log('  dep:', d),
  });

  console.log('\n=== compiler.root:', JSON.stringify(compiler.root));
  console.log('=== compiler.sources:', compiler.sources);
  console.log(
    '=== features bitset:',
    compiler.features,
    '(Utilities=' + Boolean(compiler.features & Features.Utilities) + ')',
  );

  // Build sources for scanner
  const baseSources = (compiler.root === 'none' ? [] :
    compiler.root === null ? [{ base: '/app', pattern: '**/*', negated: false }] :
    [{ ...compiler.root, negated: false }]).concat(compiler.sources);
  console.log('\n=== final scanner sources:');
  console.log(baseSources);

  const scanner = new Scanner({ sources: baseSources });
  const candidates = scanner.scan();
  console.log('\n=== candidates count:', candidates.length);
  // Show only ones that look like real Tailwind utilities
  const tw = candidates.filter((c) => /^([a-z]+(-[a-z0-9]+)*|.+:.+)$/.test(c) && !c.startsWith('!'));
  console.log('=== TW-like candidates count:', tw.length);
  console.log('=== Some real ones:', tw.filter((c) => /^(flex|grid|gap-|px-|py-|w-|h-|text-|bg-|border|rounded)/.test(c)).slice(0, 30));

  console.log('\n=== Building CSS now...');
  const built = compiler.build([...candidates]);
  console.log('=== Built CSS length:', built.length);
  console.log('--- first 600 ---');
  console.log(built.slice(0, 600));
  console.log('--- last 500 ---');
  console.log(built.slice(-500));
  console.log('--- has .flex {', /\.flex\s*\{/.test(built));
  console.log('--- has .gap-4 {', /\.gap-4\s*\{/.test(built));
  console.log('--- has .px-4 {', /\.px-4\s*\{/.test(built));
  console.log('--- has .bg-background {', /\.bg-background\s*\{/.test(built));
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
