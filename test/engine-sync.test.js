'use strict';
/* サーバー (secure-room) が使うエンジンは engine.js の写し。ずれるとオンラインと CPU 戦で結果が変わるので、同じ中身かを確かめる。
   ずれていたら: node scripts/sync_secure_room_assets.js (または cat engine.js > supabase/functions/_shared/engine.js) */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

test('サーバー用のエンジンが engine.js と同じ', () => {
  assert.equal(read('supabase/functions/_shared/engine.js'), read('engine.js'));
});

test('サーバー用のカードと効果のデータが data/ と同じ', () => {
  assert.deepEqual(JSON.parse(read('supabase/functions/_shared/cards.json')), JSON.parse(read('data/cards.json')));
  assert.deepEqual(JSON.parse(read('supabase/functions/_shared/effects.json')), JSON.parse(read('data/effects.json')));
});
