/* 学習モデル: エンジンの特徴量 (aiValnetFeatures) が、学習に使った scripts/valnet_features.js と同じ並び・同じ値になる */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { features, FEATURE_SIZE } = require('../scripts/valnet_features.js');

function load() {
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects.json'), 'utf8')));
  return E;
}

test('エンジンの特徴量と学習の特徴量が、対戦の途中のどの盤面でも一致する', () => {
  const E = load();
  E.setAiLevel(0);
  let res = E.newGame({ p0: ['PSYCHIC', 'DARKNESS', 'FIRE'], p1: ['HATE', 'SPIRIT', 'WATER'], seed: 7, useControl: true });
  let checked = 0;
  for (let i = 0; i < 400 && res.winner === null; i++) {
    const st = res.state;
    if (!res.requests.length) {
      for (const me of [0, 1]) {
        const a = E.ai.valnetFeatures(st, me), b = features(E, st, me);
        assert.equal(a.length, FEATURE_SIZE);
        assert.deepEqual(a, b);
        checked++;
      }
      const act = E.ai.action(st);
      if (!act) break;
      res = E.apply(st, act);
    } else {
      const req = res.requests[0];
      res = E.apply(st, { type: 'choose', id: req.id, picks: E.ai.answer(st, req) });
    }
  }
  assert.ok(checked > 20, '盤面を十分見た (' + checked + ')');
});

test('重みを渡さなければ点数は変わらず、渡すとロジット × 重みが足される', () => {
  const E = load();
  const res = E.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['PSYCHIC', 'DARKNESS', 'WAR'], seed: 3, useControl: true });
  const base = E.ai.score(res.state, 0);
  /* 出力が 1 つだけの 1 層のモデル: すべての重み 0、偏り 2 → ロジットは 2 */
  const n = E.ai.valnetFeatures(res.state, 0).length;
  E.setAiValueNet({ layers: [{ w: [new Array(n).fill(0)], b: [2] }] }, 10);
  assert.equal(E.ai.score(res.state, 0), base + 20);
  E.setAiValueNet(null);
  assert.equal(E.ai.score(res.state, 0), base);
});
