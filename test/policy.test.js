/* 方策モデル: 学習データの材料 (ai.policyCandidates) と、エンジンの計算 (ai.policyLogit) が学習の台本 (scripts/policy_train.py) の形と合う */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects.json'), 'utf8')));
  return E;
}

/* 入力 = 打つ前 (n) + 差 (n) + 手の種類 (5) + 表で出すカードの 1-hot。中間は ReLU、最後はそのまま */
function reference(model, before, after, flags, def) {
  let h = before.concat(after.map((v, i) => v - before[i]), flags, model.defs.map(d => (d === def ? 1 : 0)));
  model.layers.forEach((L, li) => {
    h = L.b.map((b, j) => { const v = L.w[j].reduce((s, w, q) => s + w * h[q], b); return li < model.layers.length - 1 ? Math.max(0, v) : v; });
  });
  return h[0];
}

test('方策モデルの点が、1-hot を並べた全結合の計算と一致する', () => {
  const E = load();
  E.setAiLevel(2);
  E.setAiThinkBudget(50);
  const res = E.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['HATE', 'SPIRIT', 'DEATH'], seed: 3, useControl: true });
  const pc = E.ai.policyCandidates(res.state);
  assert.ok(pc.cands.length >= 2);
  const defs = [...new Set(pc.cands.map(c => c.def).filter(Boolean))];
  let a = 1;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647 - 0.5; };
  const n = pc.before.length * 2 + 5 + defs.length;
  const model = { defs, layers: [{ w: Array.from({ length: 4 }, () => Array.from({ length: n }, rnd)), b: [0.1, -0.2, 0.3, 0] }, { w: [[rnd(), rnd(), rnd(), rnd()]], b: [0.05] }] };
  E.setAiPolicyNet(model, 10);
  for (const c of pc.cands) {
    const got = E.ai.policyLogit(pc.before, c.after, c.flags, c.def);
    assert.ok(Math.abs(got - reference(model, pc.before, c.after, c.flags, c.def)) < 1e-9);
  }
  /* 方策入りでも手を選べる */
  assert.ok(E.ai.action(res.state));
});
