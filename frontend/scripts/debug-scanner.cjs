// Manually invoke @tailwindcss/oxide scanner to see what files it finds.
const path = require('path');
const { Scanner } = require('@tailwindcss/oxide');

const base = '/app';
const sources = [
  { base, pattern: '**/*', negated: false },
];
console.log('Scanner sources:', sources);

const sc = new Scanner({ sources });
console.log('--- candidates (full scan) ---');
const candidates = sc.scan();
console.log('candidate count:', candidates.length);
console.log('first 30:', candidates.slice(0, 30));
console.log('--- scanned files (first 30) ---');
console.log('file count:', sc.files.length);
console.log(sc.files.slice(0, 30));
console.log('--- globs ---');
console.log(sc.globs);
