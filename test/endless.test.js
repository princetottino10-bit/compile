import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const EL = await import('../js3d/endless.js');
const { buildRunDefs } = await import('../js3d/runcards.js');
const { STRONGEST_AI } = await import('../js3d/aidecks.js');

test('連勝の数だけルールが足され、全部そろったらそのまま', () => {
  assert.equal(EL.endlessOpts(0, 0), null);
  assert.deepEqual(EL.activeRules(0), []);
  assert.equal(EL.activeRules(2).length, 2);
  assert.equal(EL.activeRules(99).length, EL.MAX_STAGE);
  const o = EL.endlessOpts(EL.MAX_STAGE, 0);
  assert.deepEqual(o.handSize, [5, 7]);
  assert.equal(o.first, 1);
  assert.equal(o.startControl, 1);
  assert.deepEqual(o.deckMods[1].add, ['XO_1', 'XO_2']);
  assert.equal(o.deckMods[1].swap['FIRE_1'], 'FIRE_1_UP');
  /* 自分が後ろの席でも、ルールは GATEKEEPER の側にかかる */
  const b = EL.endlessOpts(3, 1);
  assert.deepEqual(b.handSize, [6, 5]);
  assert.equal(b.first, 0);
  assert.equal(EL.ruleAt(0), null);
  assert.equal(EL.ruleAt(1), EL.STAGES[1].text);
  assert.equal(EL.ruleAt(EL.MAX_STAGE + 1), null);
});

test('Ω カードは GATEKEEPER のデッキのプロトコルのもの', () => {
  const cards = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
  const effects = JSON.parse(fs.readFileSync(new URL('../data/effects.json', import.meta.url), 'utf8'));
  const defs = buildRunDefs(cards, effects).engine;
  for (const id of EL.endlessOpts(EL.MAX_STAGE, 0).deckMods[1].add) {
    const d = defs.find(x => x.id === id);
    assert.ok(d, id);
    assert.ok(STRONGEST_AI.includes(d.proto || d.protocol), id + ' のプロトコル');
  }
});

test('全部のルールをかけた GATEKEEPER と最後まで打てる (engine が受け付ける)', () => {
  const require = createRequire(import.meta.url);
  const E = require('../engine.js');
  const cards = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
  const effects = JSON.parse(fs.readFileSync(new URL('../data/effects.json', import.meta.url), 'utf8'));
  E.init(cards, effects, buildRunDefs(cards, effects).engine);
  E.setTrace(false);
  const o = EL.endlessOpts(EL.MAX_STAGE, 0);
  let res = E.newGame({ seed: 7, p0: ['LIFE', 'LIGHT', 'DARKNESS'], p1: STRONGEST_AI, ...o });
  assert.ok(!res.error, res.error);
  assert.equal(res.state.players[1].hand.length, 7);
  E.setAiLevel(0);
  for (let i = 0; i < 6000 && res.state.winner === null; i++) {
    const st = res.state, q = res.requests && res.requests[0];
    const act = q ? { type: 'choose', id: q.id, picks: E.ai.answer(st, q) } : E.ai.action(st);
    res = E.apply(st, act);
    assert.ok(!res.error, res.error);
  }
  assert.notEqual(res.state.winner, null);
});

test('挑戦の状態: 勝てば連勝と最高、負ければ 0。途中で閉じたら1回だけやり直せる', () => {
  let s = EL.loadEndless();
  assert.equal(s.streak, 0);
  s = EL.startMatch(s);
  let r = EL.finishMatch(s, true, ['A', 'B', 'C']);
  assert.equal(r.state.streak, 1);
  assert.equal(r.milestone, null);
  s = r.state;
  for (let i = 0; i < 2; i++) s = EL.finishMatch(EL.startMatch(s), true, ['A', 'B', 'C']).state;
  assert.equal(s.streak, 3);
  r = EL.finishMatch(EL.startMatch(s), false, ['A', 'B', 'C']);
  assert.equal(r.state.streak, 0);
  assert.equal(r.state.best, 3);
  /* 決着していない対戦の結果は入れない */
  assert.equal(EL.finishMatch(r.state, true).state.streak, 0);
  /* 途中で閉じた: 1回目はやり直し、2回目は負け */
  s = EL.startMatch({ ...r.state, streak: 4, best: 4 });
  let o = EL.reopen(s);
  assert.equal(o.state.streak, 4);
  assert.ok(o.note);
  o = EL.reopen(EL.startMatch(o.state));
  assert.equal(o.state.streak, 0);
  assert.equal(EL.reopen(o.state).note, null);
  EL.saveEndless(o.state);
  assert.equal(EL.loadEndless().best, 4);
});

test('節目: 3連勝で経験値、帳簿から最高を数える', () => {
  let s = EL.startMatch({ ...EL.loadEndless(), streak: 2 });
  assert.equal(EL.finishMatch(s, true).milestone, 3);
  assert.equal(EL.bestFromLedger([{ id: 'k:' + EL.milestoneKey(3) }, { id: 'k:' + EL.milestoneKey(7) }, { id: 'k:st:c0-chief' }]), 7);
  assert.equal(EL.bestFromLedger([]), 0);
});
