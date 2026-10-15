'use strict';
/* BGM のシャッフル (bgm.js の pickShuffleBgm): 持っている曲から選び、最近流した曲は続けて選ばない */
const { test } = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = () => import('../js3d/bgm.js');

test('シャッフルの曲は、はじめから持っている COLLECTION の曲 (交換していない曲は入らない)', async () => {
  const B = await load();
  const pool = B.shufflePool();
  assert.ok(pool.includes('cho_zunou') && pool.includes('planetarium') && pool.includes('zero'));
  assert.ok(!pool.includes('noesis'), '交換していない曲');
});

test('最近流した曲 (曲数の半分まで) は選ばない', async () => {
  const B = await load();
  const pool = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  for (let round = 0; round < 20; round++) {
    const seen = [];
    for (let i = 0; i < 4; i++) {
      const k = B.pickShuffleBgm(Math.random, pool);
      assert.ok(pool.includes(k));
      seen.push(k);
    }
    for (let i = 1; i < seen.length; i++) {
      assert.ok(!seen.slice(Math.max(0, i - 3), i).includes(seen[i]), '直近3曲と同じ曲: ' + seen.join(','));
    }
  }
});

test('曲が1つしかなくても、曲が無くても止まらない', async () => {
  const B = await load();
  assert.equal(B.pickShuffleBgm(Math.random, ['only']), 'only');
  assert.equal(B.pickShuffleBgm(Math.random, ['only']), 'only');
  assert.equal(B.pickShuffleBgm(Math.random, []), null);
});
