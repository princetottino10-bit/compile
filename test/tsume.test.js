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

test('実績の数え上げに使う問題の数 (TSUME_TOTAL) が data/tsume.json と揃う', async () => {
  const { TSUME_TOTAL } = await import('../js3d/achievements.js');
  for (const tier of [1, 2, 3]) assert.equal(list.filter(p => p.tier === tier).length, TSUME_TOTAL[tier], '段 ' + tier);
});

test('今日の問題: 一覧の問題とは別の盤面で、日ごとに決まり、問題数の日数で全部を一巡する', async () => {
  const { dailyPick } = await import('../js3d/tsume.js');
  const daily = JSON.parse(fs.readFileSync(path.join(root, 'data/tsume-daily.json'), 'utf8'));
  assert.ok(daily.length >= 100);
  const fixed = new Set(list.map(p => JSON.stringify(p.spec)));
  assert.ok(daily.every(p => !fixed.has(JSON.stringify(p.spec))), '一覧に置いた問題は出さない');
  assert.equal(dailyPick(daily, 20000).id, dailyPick(daily, 20000).id);
  assert.equal(dailyPick(daily, 20000).daily, 20000);
  const seen = new Set();
  for (let d = 0; d < daily.length; d++) seen.add(dailyPick(daily, 20000 + d).id);
  assert.equal(seen.size, daily.length);
});

test('今日の問題はどれも模範解答で解ける', async () => {
  const { judgeTsume } = await import('../js3d/tsume.js');
  const daily = JSON.parse(fs.readFileSync(path.join(root, 'data/tsume-daily.json'), 'utf8'));
  for (const p of daily) {
    let res = E.newPuzzle(p.spec, { seed: 1 });
    for (const a of p.solution) res = E.apply(res.state, a);
    assert.equal(judgeTsume(p.goal, endState(res), res.state, 0, E).ok, true, p.id);
  }
});

test('COMPUZZLE の実績: 中級を全部で PUZZLER、全部で COMPUZZLER、今日の問題の日数', async () => {
  const { TROPHIES, TSUME_TOTAL } = await import('../js3d/achievements.js');
  const t = (id) => TROPHIES.find(x => x.id === id);
  const ctx = (ids) => ({ records: [], level: 1, cardWins: new Map(), game: null, xp: ids.map(id => ({ id, src: 'tsume', xp: 3, at: 0 })) });
  const mids = Array.from({ length: TSUME_TOTAL[2] }, (_, i) => 'k:ts:t2-' + String(i + 1).padStart(2, '0'));
  assert.equal(t('tsume_mid').test(ctx(mids.slice(1))), false);
  assert.equal(t('tsume_mid').test(ctx(mids)), true);
  assert.equal(t('tsume_all').test(ctx(mids)), false);
  const all = list.map(p => 'k:ts:' + p.id);
  assert.equal(t('tsume_all').test(ctx(all)), true);
  assert.equal(t('daily_puzzle7').test(ctx(['k:dp:1', 'k:dp:2', 'k:dp:3', 'k:dp:4', 'k:dp:5', 'k:dp:6'])), false);
  assert.equal(t('daily_puzzle7').test(ctx(['k:dp:1', 'k:dp:2', 'k:dp:3', 'k:dp:4', 'k:dp:5', 'k:dp:6', 'k:dp:7'])), true);
  assert.equal(t('puzzle').test(ctx(['k:ts:t1-01'])), true);
});
