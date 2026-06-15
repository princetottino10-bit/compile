'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'supabase', 'functions', '_shared');
fs.mkdirSync(dest, { recursive: true });
for (const [source, name] of [
  ['engine.js', 'engine.js'],
  [path.join('data', 'cards.json'), 'cards.json'],
  [path.join('data', 'effects.json'), 'effects.json'],
]) {
  fs.copyFileSync(path.join(root, source), path.join(dest, name));
}
console.log('secure room assets synced');
