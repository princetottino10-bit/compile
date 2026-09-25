'use strict';
/* 詰めコンパイル: 収録した問題が、模範解答どおりに動かすと解けること (判定はゲームと同じ judgeTsume) */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const root = path.join(__dirname, '..');
E.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));
E.setTrace(true);
const list = JSON.parse(fs.readFileSync(path.join(root, 'data/tsume.json'), 'utf8'));

function endState(res) {
  for (const t of (res.trace || [])) if (t.st && t.st.turn !== 0) return t.st;
  return res.state;
}

test('詰めコンパイルは初級5問・中級10問・上級10問で、id が重ならない', () => {
  for (const [tier, n] of [[1, 5], [2, 10], [3, 10]]) assert.equal(list.filter(p => p.tier === tier).length, n);
  assert.equal(new Set(list.map(p => p.id)).size, list.length);
  assert.ok(list.some(p => p.opp) && list.some(p => !p.opp), '相手の盤面を使う問題とそうでない問題が混ざる');
});

for (const p of list) {
  test('詰めコンパイル ' + p.id + ': 模範解答で解ける', async () => {
    const { judgeTsume } = await import('../js3d/tsume.js');
    let res = E.newPuzzle(p.spec, { seed: 1 });
    assert.equal(res.error, null);
    /* 最初はまだお題を満たしていない */
    assert.notEqual(judgeTsume(p.goal, res.state, res.state, 0, E).ok, true);
    for (const a of p.solution) {
      res = E.apply(res.state, a);
      assert.equal(res.error, null, JSON.stringify(a));
    }
    assert.notEqual(res.state.turn, 0, '手番が終わっている');
    assert.equal(judgeTsume(p.goal, endState(res), res.state, 0, E).ok, true);
    assert.equal(p.steps.length, p.solution.length);
  });
}
