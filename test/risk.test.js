import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildRunDefs } from '../js3d/runcards.js';
import { battleOpts, newRun, PATCHES, TAGS, finishBattle } from '../js3d/run.js';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects, buildRunDefs(cards, effects).engine);
Engine.setAiLevel(0);
const NAMES = cards.protocols.map(p => p.name);
const run0 = (patches) => {
  const r = { ...newRun(NAMES, () => 0.3, 0), deck: ['FIRE', 'WATER', 'SPEED'], patches, phase: 'battle' };
  return { ...r, pos: r.map.rows[5][0].id, opp: { deck: ['DEATH', 'METAL', 'LIFE'], level: 1 } };
};
const valueOf = (st, uid) => {
  /* 場に置いて合計値で見る (値の計算は lineTotal を通る) */
  const c = st.cards[uid];
  st.players[c.owner].hand = st.players[c.owner].hand.filter(u => u !== uid);
  st.players[c.owner].deck = st.players[c.owner].deck.filter(u => u !== uid);
  c.zone = 'line';
  st.lines[0][c.owner].push(uid);
  return Engine.lineTotal ? Engine.lineTotal(st, 0, c.owner) : null;
};

test('RISK: どのパッチにも代償があり、系統のボーナスがある', () => {
  const risk = PATCHES.filter(p => p.tag === 'RISK');
  assert.ok(risk.length >= 6);
  for (const p of risk) assert.ok(p.cost, p.id + ' に代償');
  assert.equal(TAGS.RISK.bonus.length, 2);
});

test('RISK: 試合の設定 (手札・値・捨てる・1本勝ち)', () => {
  assert.equal(battleOpts(run0(['nocost']), 0).handSize[0], 3);
  assert.equal(battleOpts(run0(['nocost']), 0).perks[0].freeDiscard, true);
  const g = battleOpts(run0(['gluttony']), 0);
  assert.deepEqual(g.handSize, [7, 7]);
  assert.equal(battleOpts(run0(['double']), 0).perks[0].doubleProto, 'FIRE');
  /* ONE SHOT: ルールは3本のまま、2つ済みから始まる (自分だけ) */
  const one = battleOpts(run0(['oneshot']), 0);
  assert.equal(one.winCompilesBySide[0], 3);
  assert.deepEqual(one.startCompiled, [2, 0]);
  const st = Engine.newGame({ seed: 5, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'METAL', 'LIFE'], winCompilesBySide: one.winCompilesBySide, startCompiled: one.startCompiled }).state;
  assert.equal(st.players[0].protocols.filter(p => p.compiled).length, 2);
  assert.equal(st.players[1].protocols.filter(p => p.compiled).length, 0);
});

test('RISK: エンジンで値が変わる (DOUBLE DOWN・SHADOW RULE)', () => {
  const base = Engine.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'METAL', 'LIFE'] }).state;
  const dbl = Engine.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'METAL', 'LIFE'], perks: [{ doubleProto: 'FIRE', otherMinus: 1 }, null] }).state;
  const fire = 'p0:FIRE_5', water = 'p0:WATER_5';
  for (const st of [base, dbl]) { st.cards[fire].faceUp = true; st.cards[water].faceUp = true; }
  const printed = (id) => cards.protocols.flatMap(p => p.cards).find(c => c.id === id).value;
  assert.ok(Engine.lineTotal, 'engine が lineTotal を出している');
  assert.equal(valueOf(dbl, fire), printed('FIRE_5') * 2, 'FIRE は2倍');
  const d2 = Engine.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'METAL', 'LIFE'], perks: [{ doubleProto: 'FIRE', otherMinus: 1 }, null] }).state;
  d2.cards[water].faceUp = true;
  assert.equal(valueOf(d2, water), Math.max(0, printed('WATER_5') - 1), 'ほかは −1');
  const sh = Engine.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'METAL', 'LIFE'], perks: [{ faceDownValue: 4, faceUpMinus: 1 }, null] }).state;
  sh.cards[fire].faceUp = false;
  assert.equal(valueOf(sh, fire), 4, '裏向きは 4');
});

test('RISK: ALL IN は負けるとライフがさらに減り、ONE SHOT は最大ライフが半分', () => {
  const r = run0(['allin']);
  const lost = finishBattle(r, false, 1, NAMES, () => 0.5);
  assert.equal(lost.life, r.life - 1 - 2);
  const won = finishBattle(r, true, 0, NAMES, () => 0.5);
  assert.ok(won.credits - r.credits >= 9, '勝つとクレジット3倍');
});

test('RISK: パッチを全部付けた試合も CPU どうしで最後まで遊べる', () => {
  const o = battleOpts(run0(['nocost', 'double', 'shadow', 'oneshot']), 0);
  let res = Engine.newGame({ seed: 11, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'METAL', 'LIFE'], winCompiles: o.winCompiles,
    handSize: o.handSize, perks: o.perks, winCompilesBySide: o.winCompilesBySide, startCompiled: o.startCompiled });
  for (let i = 0; i < 3000 && res.state.winner === null; i++) {
    const q = res.requests[0];
    const a = q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) } : Engine.ai.action(res.state);
    res = Engine.apply(res.state, a);
    assert.equal(res.error, null, 'step ' + i);
  }
  assert.notEqual(res.state.winner, null);
});
