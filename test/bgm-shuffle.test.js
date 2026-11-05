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

test('COLLECTION の曲はどれも BPM が書いてある (曲を足したら測って bgm.js の BPM に書く)', async () => {
  const B = await load();
  const { TRACKS } = await import('../js3d/bgm-shop.js');
  const missing = TRACKS.map(t => t.key).filter(k => !(k in B.BPM));
  assert.deepEqual(missing, []);
});

test('対戦のシャッフルは BATTLE_MIN_BPM 以上の曲だけ。メニューの曲・遅い曲は入らず、メニューのシャッフルには残る', async () => {
  const B = await load();
  const pool = B.battlePool();
  assert.ok(pool.length >= 20, '対戦の曲が少なすぎる: ' + pool.length);
  for (const k of pool) assert.ok(B.BPM[k] >= B.BATTLE_MIN_BPM, k + ' は ' + B.BPM[k] + ' BPM');
  for (const k of [...B.MENU_BGMS, B.RUN_BGM, 'theme_ruri', 'theme_whitecul', 'boss_abyss']) {
    assert.ok(!pool.includes(k), k + ' が対戦のシャッフルに入っている');
  }
  assert.ok(B.shufflePool().includes('circuit_red') && B.shufflePool().includes('theme_whitecul'), 'メニューのシャッフルからは外さない');
  for (let i = 0; i < 50; i++) assert.ok(pool.includes(B.onlineBattleBgm()), 'オンラインも対戦の曲から');
});

test('対戦の場面の曲 (ふつうの対戦・あと1本・強敵・ソロ・勝ち抜き戦) は BATTLE_MIN_BPM 以上', async () => {
  const B = await load();
  const keys = [...B.NORMAL_BGMS, ...B.TENSE_BGMS, B.STRONG_BGM, B.BOT_BGM, B.GATE_BGM, B.STORY_BATTLE_BGM, B.DIRECTOR_BGM];
  for (const k of keys) assert.ok(B.fastEnough(k), k + ' は ' + B.BPM[k] + ' BPM');
  assert.ok(!B.fastEnough('theme_ruri') && B.fastEnough('theme_shion'));
});
