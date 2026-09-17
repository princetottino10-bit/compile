'use strict';
/* トレーニング盤面: ターン進行なしで、置く・反転・移動を任意の順に行える。
   effects が真なら通常のプレイと同じ経路で効果を解決し、偽なら盤面だけを変える。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const root = path.join(__dirname, '..');
Engine.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));

const PROTOS = { p0: ['DARKNESS', 'HATE', 'SPEED'], p1: ['FIRE', 'WATER', 'LIFE'] };

/* 選択要求には先頭の候補で答えて、操作を最後まで解決する */
function run(state, action) {
  let res = Engine.apply(state, action);
  for (let guard = 0; res.requests.length && guard < 30; guard++) {
    const q = res.requests[0];
    const need = q.min === undefined ? 1 : Math.max(q.min, 1);
    const picks = q.kind === 'yesNo' ? ['yes']
      : q.kind === 'pickLine' ? [q.lines[0]]
      : q.kind === 'option' ? [0]
      : (q.candidates || []).slice(0, need);
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks });
  }
  assert.equal(res.error, null, String(res.error));
  assert.equal(res.requests.length, 0);
  return res.state;
}

function fresh() {
  const res = Engine.newGame({ seed: 7, p0: PROTOS.p0, p1: PROTOS.p1, training: true });
  assert.equal(res.error, null);
  return res.state;
}

test('トレーニングは手札を配らず、ターンを進めない盤面で始まる', () => {
  const st = fresh();
  assert.equal(st.phase, 'training');
  assert.deepEqual(st.players.map(p => p.hand.length), [0, 0]);
  assert.deepEqual(st.players.map(p => p.deck.length), [18, 18]);
  assert.deepEqual(Engine.legalActions(st), []);
});

test('効果なしで置くと、中段は解決されない', () => {
  const st = run(fresh(), { type: 'trainingPlace', card: 'p0:DARKNESS_1', line: 0, faceUp: true, effects: false });
  assert.deepEqual(st.lines[0][0], ['p0:DARKNESS_1']);
  assert.equal(st.players[0].hand.length, 0);
  assert.equal(st.phase, 'training');
});

test('効果ありで置くと、通常のプレイと同じく中段を解決してその場で止まる', () => {
  const st = run(fresh(), { type: 'trainingPlace', card: 'p0:DARKNESS_1', line: 0, faceUp: true, effects: true });
  assert.deepEqual(st.lines[0][0], ['p0:DARKNESS_1']);
  assert.equal(st.players[0].hand.length, 3, 'DARKNESS 1: カードを3枚引く');
  assert.equal(st.phase, 'training');
  assert.equal(st.turn, 0);
});

test('相手側のカードも、その持ち主の効果として解決する', () => {
  let st = run(fresh(), { type: 'trainingPlace', card: 'p1:FIRE_1', line: 0, faceUp: true, effects: false });
  /* FIRE 1 の下段: 覆われることになったとき、先にカードを1枚引く */
  st = run(st, { type: 'trainingPlace', card: 'p1:WATER_1', line: 0, faceUp: false, effects: true });
  assert.ok(st.players[1].hand.length >= 1, 'FIRE 1 の持ち主 (P2) が引く');
  assert.equal(st.players[0].hand.length, 0);
  assert.deepEqual(st.lines[0][1], ['p1:FIRE_1', 'p1:WATER_1']);
});

test('場のカードを移動・反転・手札へ戻せる', () => {
  let st = run(fresh(), { type: 'trainingPlace', card: 'p0:HATE_4', line: 1, faceUp: true, effects: false });
  st = run(st, { type: 'trainingPlace', card: 'p0:HATE_4', line: 2, faceUp: true, effects: false });
  assert.deepEqual(st.lines[1][0], []);
  assert.deepEqual(st.lines[2][0], ['p0:HATE_4']);
  st = run(st, { type: 'trainingFlip', card: 'p0:HATE_4', effects: true });
  assert.equal(st.cards['p0:HATE_4'].faceUp, false);
  st = run(st, { type: 'trainingMove', card: 'p0:HATE_4', to: 'hand', effects: true });
  assert.deepEqual(st.players[0].hand, ['p0:HATE_4']);
  st = run(st, { type: 'trainingMove', card: 'p0:HATE_4', to: 'trash', effects: true });
  assert.deepEqual(st.players[0].trash, ['p0:HATE_4']);
  assert.equal(st.cards['p0:HATE_4'].knownTo, 3, '検証盤面では山札以外は公開');
});

test('ドローと開始・終了時効果を任意の側で実行できる', () => {
  let st = run(fresh(), { type: 'trainingDraw', side: 1 });
  assert.equal(st.players[1].hand.length, 1);
  st = run(st, { type: 'trainingPhase', side: 0, which: 'start' });
  st = run(st, { type: 'trainingPhase', side: 1, which: 'end' });
  assert.equal(st.phase, 'training');
});

test('通常の対局ではトレーニング操作を受け付けない', () => {
  const res = Engine.newGame({ seed: 3, p0: PROTOS.p0, p1: PROTOS.p1 });
  const uid = res.state.players[0].hand[0];
  const out = Engine.apply(res.state, { type: 'trainingPlace', card: uid, line: 0, faceUp: false, effects: false });
  assert.ok(out.error);
});
