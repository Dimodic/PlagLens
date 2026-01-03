// Load the vite config and print which plugins are registered.
const path = require('path');
process.chdir('/app');

(async () => {
  const { resolveConfig } = await import('vite');
  const config = await resolveConfig({}, 'serve');
  console.log('=== Plugins (in order) ===');
  for (const p of config.plugins) {
    console.log(
      `  ${p.name}  enforce=${p.enforce || '(default)'}  apply=${
        typeof p.apply === 'function' ? 'fn' : p.apply || 'always'
      }  transform=${typeof p.transform}  load=${typeof p.load}  resolveId=${typeof p.resolveId}`,
    );
  }
})();
