/* コンボ学習: エンジンの組み合わせの値 (aiComboLogit) が、学習の式 (scripts/combo_train.py) と
   学習に使ったトークン (scripts/combo_features.js) で計算した値と一致する */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { comboTokens } = require('../scripts/combo_features.js');

function load() {
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects.json'), 'utf8')));
  return E;
}

/* 決まった種のでたらめな表: 4 種類の札の置き場 × 全カード */
function randomModel(E, st) {
  let a = 12345;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
  const tokens = {};
  for (const uid of Object.keys(st.cards)) {
    for (const p of ['H', 'T', 'C', 'D']) {
      const key = p + ':' + st.cards[uid].def;
      if (!tokens[key]) tokens[key] = { w: rnd(), v: [rnd(), rnd(), rnd()] };
    }
  }
  return { k: 3, a: 0.5, b: 0, tokens };
}

/* 学習の式そのまま: Σw + 0.5 * (|Σv|^2 − Σ|v|^2) */
function reference(model, toks) {
  let z = 0, sq = 0;
  const sum = new Array(model.k).fill(0);
  for (const t of toks) {
    const e = model.tokens[t];
    if (!e) continue;
    z += e.w;
    e.v.forEach((x, i) => { sum[i] += x; sq += x * x; });
  }
  return z + 0.5 * (sum.reduce((s, x) => s + x * x, 0) - sq);
}

test('エンジンの組み合わせの値と学習の式が、対戦の途中のどの盤面でも一致する', () => {
  const E = load();
  E.setAiLevel(0);
  let res = E.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['GRAVITY', 'SPIRIT', 'DEATH'], seed: 11, useControl: true });
  const model = randomModel(E, res.state);
  E.setAiComboNet(model, 1);
  let checked = 0;
  for (let i = 0; i < 400 && res.winner === null; i++) {
    const st = res.state;
    if (!res.requests.length) {
      for (const me of [0, 1]) {
        const got = E.ai.comboLogit(st, me), want = reference(model, comboTokens(st, me));
        assert.ok(Math.abs(got - want) < 1e-9, got + ' != ' + want);
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

test('表を渡さなければ点数は変わらず、渡すと値 × 重みが足され、外すと戻る', () => {
  const E = load();
  const res = E.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['PSYCHIC', 'DARKNESS', 'WAR'], seed: 3, useControl: true });
  const base = E.ai.score(res.state, 0);
  /* 手札の札だけ 1 枚ずつの重み 1、組み合わせ 0 → 値は手札の枚数 */
  const tokens = {};
  for (const uid of res.state.players[0].hand) tokens['H:' + res.state.cards[uid].def] = { w: 1, v: [0] };
  E.setAiComboNet({ k: 1, a: 1, b: 0, tokens }, 10);
  const n = res.state.players[0].hand.length;
  assert.ok(Math.abs(E.ai.score(res.state, 0) - (base + 10 * n)) < 1e-9);
  E.setAiComboNet(null);
  assert.equal(E.ai.score(res.state, 0), base);
});
