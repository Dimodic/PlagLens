const fs = require('fs');
const http = require('http');
http
  .get('http://localhost:5173/src/styles/global.css', (res) => {
    let buf = '';
    res.on('data', (c) => (buf += c));
    res.on('end', () => {
      const m = buf.match(/const __vite__css = "((?:[^"\\]|\\.)*)"/);
      if (!m) {
        console.log('NOT FOUND - first 300 chars:');
        console.log(buf.slice(0, 300));
        return;
      }
      const css = JSON.parse('"' + m[1] + '"');
      console.log('Total CSS length:', css.length);
      console.log('--- first 800 ---');
      console.log(css.slice(0, 800));
      console.log('\n--- last 800 ---');
      console.log(css.slice(-800));
      console.log('\n--- checks ---');
      console.log('.flex {            ', /\.flex\s*\{/.test(css));
      console.log('.grid {            ', /\.grid\s*\{/.test(css));
      console.log('.px-4 {            ', /\.px-4\s*\{/.test(css));
      console.log('.gap-4 {           ', /\.gap-4\s*\{/.test(css));
      console.log('.bg-background {   ', /\.bg-background\s*\{/.test(css));
      console.log('.border-border {   ', /\.border-border\s*\{/.test(css));
      console.log('@layer utilities {', /@layer utilities\s*\{/.test(css));
      console.log('count of "utilities":', (css.match(/utilities/g) || []).length);
      console.log('--- structure ---');
      console.log('contains @import:', css.includes('@import'));
      console.log('contains @source:', css.includes('@source'));
      console.log('contains @theme:', css.includes('@theme'));
      console.log('contains tailwindcss v4 banner:', css.includes('tailwindcss v4'));
      console.log('contains color-primary token:', css.includes('color-primary'));
      console.log('contains chart-1 token:', css.includes('chart-1'));
      console.log('--- searching for any utility class ---');
      const matches = css.match(/^\.[a-z][\w-]*\s*\{/gm) || [];
      console.log('total simple utility-like rules:', matches.length);
      console.log('first 10:', matches.slice(0, 10));
    });
  })
  .on('error', (e) => console.error('REQ ERR:', e.message));
