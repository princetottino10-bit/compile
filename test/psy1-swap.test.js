'use strict';
/* 設定「PSYCHIC 1 の上段と下段を入れ替える」(st.psy1Swap)。
   入れ替えると上段が「開始：このカードを反転させる」(覆われても効く)、下段が「相手は裏向きでのみプレイできる」(一番上のときだけ)。
   node --test test/psy1-swap.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

function puzzle(s0, s1, swap) {
  const res = Engine.newPuzzle({ sides: [s0, s1], psy1Swap: !!swap }, { seed: 1 });
  assert.equal(res.error, null, 'newPuzzle エラー: ' + res.error);
  return res;
}
const stack = (st, line, side) => st.lines[line][side].map(u => [st.cards[u].def, st.cards[u].faceUp]);
const faceUpPlays = (st) => Engine.legalActions(st).filter(a => a.type === 'play' && a.faceUp);

test('newGame の psy1Swap は盤面に残り、指定しなければ立たない', () => {
  const on = Engine.newGame({ seed: 3, p0: ['PSYCHIC', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'SPEED'], psy1Swap: true });
  const off = Engine.newGame({ seed: 3, p0: ['PSYCHIC', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'SPEED'] });
  assert.equal(on.state.psy1Swap, true);
  assert.equal('psy1Swap' in off.state, false);
});

test('入れ替えなし: 覆われた表の PSYCHIC 1 は開始で裏返らず、ロックが続く', () => {
  const r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[['PSYCHIC_2', true], ['WATER_6', false]], [], []], hand: ['WATER_5'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: ['SPEED_6'] }, false);
  assert.deepEqual(stack(r.state, 0, 0), [['PSYCHIC_2', true], ['WATER_6', false]]);
});

test('入れ替え: 覆われた表の PSYCHIC 1 も上段の「開始：反転」で裏返る', () => {
  const r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[['PSYCHIC_2', true], ['WATER_6', false]], [], []], hand: ['WATER_5'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: ['SPEED_6'] }, true);
  assert.deepEqual(stack(r.state, 0, 0), [['PSYCHIC_2', false], ['WATER_6', false]]);
});

test('入れ替え: 一番上の表の PSYCHIC 1 は下段で相手を裏向きだけにし、覆われると止まる', () => {
  /* 相手の番の盤面を作るため、P2 から始まる問題にはできないので、P1 が出したあとの盤面で見る */
  let r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PSYCHIC_2', 'WATER_6'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: ['SPEED_6', 'METAL_6'] }, true);
  r = Engine.apply(r.state, { type: 'play', card: 'p0:PSYCHIC_2', line: 0, faceUp: true });
  assert.equal(r.error, null);
  assert.equal(r.state.turn, 1);
  assert.equal(faceUpPlays(r.state).length, 0, '一番上なら下段が効いて表で出せない');
  assert.equal(Engine.playBlockReason(r.state, 1, 'p1:SPEED_6', 0, true).rule, 'oppFaceDownOnly');

  /* 同じ札を覆った盤面: 下段は止まり、相手は表で出せる */
  const st = JSON.parse(JSON.stringify(r.state));
  const cov = 'p0:WATER_6';
  st.players[0].hand = st.players[0].hand.filter(u => u !== cov);
  st.lines[0][0].push(cov);
  Object.assign(st.cards[cov], { zone: 'field', faceUp: false });
  assert.ok(faceUpPlays(st).length > 0, '覆われたら下段は効かない');
});

test('入れ替えなしの一番上の PSYCHIC 1 は、これまでどおり上段で相手を裏向きだけにする', () => {
  let r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PSYCHIC_2'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: ['SPEED_6', 'METAL_6'] }, false);
  r = Engine.apply(r.state, { type: 'play', card: 'p0:PSYCHIC_2', line: 0, faceUp: true });
  assert.equal(faceUpPlays(r.state).length, 0);
});

test('入れ替え: CPU はどちらの側でも合法な手を返す (ロック特化の読みが走らない)', () => {
  Engine.setAiLevel(1);
  for (let seed = 1; seed <= 2; seed++) {
    let res = Engine.newGame({ seed, p0: ['PSYCHIC', 'DARKNESS', 'SPEED'], p1: ['PSYCHIC', 'FIRE', 'WATER'], psy1Swap: true, useControl: true });
    for (let n = 0; n < 24 && !res.state.winner; n++) {
      const st = res.state;
      const a = res.requests.length ? null : Engine.ai.action(st, st.turn);
      if (res.requests.length) {
        const req = res.requests[0];
        res = Engine.apply(st, { type: 'choose', id: req.id, picks: Engine.ai.answer(st, req) });
      } else res = Engine.apply(st, a);
      assert.equal(res.error, null, 'seed ' + seed + ': ' + res.error);
      assert.equal(res.state.psy1Swap, true);
    }
  }
  Engine.setAiLevel(1);
});
