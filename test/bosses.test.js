import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildRunDefs, UP } from '../js3d/runcards.js';
import { BOSSES, FINAL_BOSS, bossOf, battleOpts, newRun } from '../js3d/run.js';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects, buildRunDefs(cards, effects).engine);
Engine.setAiLevel(0);
const NAMES = cards.protocols.map(p => p.name);

/* ボス戦の直前の状態 (BOSS のマスにいる) */
function atBoss(bossId) {
  const run = { ...newRun(NAMES, () => 0.3, 0), deck: ['GRAVITY', 'SPIRIT', 'PSYCHIC'], phase: 'battle', boss: bossId };
  const top = run.map.rows[run.map.rows.length - 1][0];
  const B = bossOf(run);
  return { ...run, pos: top.id, opp: { deck: B.deck.slice(), level: 3, boss: true, bossId } };
}

test('ボス: どれもプロトコルが3つあり、勝ち抜き戦ごとに1体決まる (HEAT 5 は最強)', () => {
  for (const b of BOSSES.concat(FINAL_BOSS)) {
    assert.equal(b.deck.length, 3, b.id);
    for (const n of b.deck) assert.ok(NAMES.includes(n), b.id + ': ' + n);
  }
  assert.ok(BOSSES.some(b => b.id === newRun(NAMES, () => 0.5, 0).boss));
  assert.equal(newRun(NAMES, () => 0.5, 5).boss, FINAL_BOSS.id);
  assert.equal(bossOf({}).id, FINAL_BOSS.id, '前の保存 (ボスが無い) は最強');
});

test('ボスのルールが試合の設定に入る', () => {
  const inferno = battleOpts(atBoss('inferno'), 0);
  assert.equal(inferno.deckMods[1].swap.FIRE_1, 'FIRE_1' + UP);
  assert.equal(battleOpts(atBoss('abyss'), 0).handSize[1], 7);
  const clock = battleOpts(atBoss('clock'), 0);
  assert.equal(clock.first, 1);
  assert.equal(clock.startControl, 1);
  assert.equal(battleOpts(atBoss('mirror'), 0).handSize[0], 4);
  assert.deepEqual(battleOpts(atBoss('sanctuary'), 0).winCompilesBySide, [3, 2]);
  assert.deepEqual(battleOpts(atBoss('glacier'), 0).deckMods[1].add, ['X_WATER', 'X_WATER' + UP]);
  /* 聖域: エンジンも側ごとの本数で決着を見る */
  const st = Engine.newGame({ seed: 1, p0: ['GRAVITY', 'SPIRIT', 'PSYCHIC'], p1: ['LIGHT', 'LIFE', 'PEACE'], winCompiles: 2, winCompilesBySide: [3, 2] }).state;
  assert.deepEqual(st.winBySide, [3, 2]);
});

test('ボス戦は CPU どうしで最後まで遊べる', () => {
  for (const b of BOSSES.concat(FINAL_BOSS)) {
    const run = atBoss(b.id);
    const o = battleOpts(run, 0);
    let res = Engine.newGame({ seed: 7, p0: run.deck, p1: run.opp.deck, winCompiles: o.winCompiles, handSize: o.handSize,
      first: o.first, startControl: o.startControl, deckMods: o.deckMods, winCompilesBySide: o.winCompilesBySide });
    assert.ok(!res.error, b.id);
    for (let i = 0; i < 3000 && res.state.winner === null; i++) {
      const q = res.requests[0];
      const a = q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) } : Engine.ai.action(res.state);
      res = Engine.apply(res.state, a);
      assert.equal(res.error, null, b.id + ' step ' + i);
    }
    assert.notEqual(res.state.winner, null, b.id + ' で決着しない');
  }
});
