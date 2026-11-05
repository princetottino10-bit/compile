'use strict';
/* カード効果の検証 (Aux 3: FLEXIBLE / INERT / RIGID)
   node --test test/cards-a3.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

const U0 = (d) => 'p0:' + d;
const U1 = (d) => 'p1:' + d;
function pz(s0, s1, extra) {
  const res = Engine.newPuzzle(Object.assign({ sides: [s0, s1] }, extra || {}), { seed: 1 });
  assert.equal(res.error, null);
  return res;
}
function drive(res, handlers, maxSteps) {
  let n = 0;
  while (res.requests.length) {
    if (++n > (maxSteps || 40)) throw new Error('drive: 選択要求が収束しない: ' + JSON.stringify(res.requests[0]));
    const req = res.requests[0];
    const h = (handlers || {})[req.prompt] !== undefined ? handlers[req.prompt] : (handlers || {})[req.kind];
    if (h === undefined) throw new Error('予期しない要求: ' + JSON.stringify(req));
    const picks = typeof h === 'function' ? h(req, res) : h;
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error);
  }
  return res;
}
function act(res, action) {
  const r = Engine.apply(res.state, action);
  assert.equal(r.error, null, 'apply エラー: ' + r.error);
  return r;
}
const playUp = (res, uid, line) => act(res, { type: 'play', card: uid, line, faceUp: true });
const playDown = (res, uid, line) => act(res, { type: 'play', card: uid, line, faceUp: false });
const stack = (st, l, s) => st.lines[l][s].map(u => [st.cards[u].def, st.cards[u].faceUp]);

const A = ['FLEXIBLE', 'INERT', 'RIGID'];
const B = ['ENVY', 'ICE', 'WRATH'];

test('Aux 3: 3プロトコル18枚、値の並び (RIGID は 1〜5 と 7)', () => {
  const a3 = cards.protocols.filter(p => p.set === 'Aux 3');
  assert.deepEqual(a3.map(p => p.name), ['FLEXIBLE', 'INERT', 'RIGID']);
  assert.equal(a3.find(p => p.name === 'RIGID').cards.map(c => c.value).join(''), '123457');
  assert.equal(a3.find(p => p.name === 'INERT').cards.map(c => c.value).join(''), '012345');
});

test('INERT_1 上段: このラインの他のカードは上段を持たない (ENVY_1 の足し算が消える)', () => {
  const base = pz({ protos: B, lines: [[['ENVY_1', true]], [], []] },
    { protos: A, lines: [[['RIGID_5', true]], [], []] });
  assert.equal(Engine.lineTotal(base.state, 0, 0), 5, 'ENVY_1: 相手の最大値 5 だけ増える');
  const res = pz({ protos: B, lines: [[['ENVY_1', true]], [], []] },
    { protos: A, lines: [[['INERT_1', false], ['RIGID_5', true]], [], []] });
  assert.equal(Engine.lineTotal(res.state, 0, 0), 5, '裏向きの INERT_1 は効かない');
  const res2 = pz({ protos: B, lines: [[['ENVY_1', true]], [], []] },
    { protos: A, lines: [[['INERT_1', true], ['RIGID_5', true]], [], []] });
  assert.equal(Engine.lineTotal(res2.state, 0, 0), 0, '覆われていても INERT_1 の上段は効く');
  const res3 = pz({ protos: B, lines: [[], [['ENVY_1', true]], []] },
    { protos: A, lines: [[['INERT_1', true]], [['RIGID_5', true]], []] });
  assert.equal(Engine.lineTotal(res3.state, 1, 0), 5, '他のラインには効かない');
});

test('INERT_2 下段: このラインの他のカードは下段を持たない (ICE_4 が反転できるようになる)', () => {
  const ice4 = cards.protocols.find(p => p.name === 'ICE').cards.find(c => effects[c.id].lower && effects[c.id].lower.static && effects[c.id].lower.static.kind === 'cannotFlipThis');
  let res = pz({ protos: B, lines: [[[ice4.id, true]], [], []], hand: ['WRATH_4'] },
    { protos: A, lines: [[['INERT_2', true]], [], []] });
  res = drive(playUp(res, U0('WRATH_4'), 2), { 'flip': (req) => [U0(ice4.id)], pickCard: (req) => [U0(ice4.id)], discard: [] });
  assert.equal(res.state.cards[U0(ice4.id)].faceUp, false, 'ICE の「反転させることはできない」が消えている');
});

test('INERT_3: 1ラインを選び、そのラインで値が最も大きい表向きをすべて反転', () => {
  let res = pz({ protos: A, lines: [[], [], []], hand: ['INERT_3'] },
    { protos: B, lines: [[['ENVY_5', true]], [['WRATH_2', true]], []] });
  res = drive(playUp(res, U0('INERT_3'), 1), { pickLine: [0], discard: [] });
  assert.equal(res.state.cards[U1('ENVY_5')].faceUp, false);
  assert.equal(res.state.cards[U1('WRATH_2')].faceUp, true);
});

test('INERT_5: 両者のデッキをすべて捨て札にする', () => {
  let res = pz({ protos: A, lines: [[], [], []], hand: ['INERT_5'], deck: ['FLEXIBLE_1', 'FLEXIBLE_2'] },
    { protos: B, lines: [[], [], []], deck: ['WRATH_1', 'WRATH_2', 'WRATH_3'] });
  res = drive(playUp(res, U0('INERT_5'), 1), {});
  assert.equal(res.state.players[0].deck.length, 0);
  assert.equal(res.state.players[1].deck.length, 0);
  assert.ok(res.state.players[0].trash.includes(U0('FLEXIBLE_1')));
  assert.ok(res.state.players[1].trash.includes(U1('WRATH_3')));
});

test('RIGID_6: 反転させられず、移動させられない', () => {
  let res = pz({ protos: B, lines: [[], [], []], hand: ['WRATH_4'] },
    { protos: A, lines: [[['RIGID_6', true]], [], []] });
  res = drive(playUp(res, U0('WRATH_4'), 2), { discard: [] });
  assert.equal(res.state.cards[U1('RIGID_6')].faceUp, true, '反転の候補に入らない');
  let r2 = pz({ protos: ['FLEXIBLE', 'INERT', 'ENVY'], lines: [[], [], []], hand: ['FLEXIBLE_4'] },
    { protos: ['RIGID', 'ICE', 'WRATH'], lines: [[['RIGID_6', true]], [], []] });
  // 相手のカードは RIGID_6 だけ。移動の候補に入らないので、選択肢は入れ替えだけになる
  r2 = drive(playUp(r2, U0('FLEXIBLE_4'), 0), { option: [0], pickLine: [1], discard: [], arrange: [1, 0, 2] });
  assert.deepEqual(r2.state.lines[0][1].map(u => r2.state.cards[u].def), ['RIGID_6']);
});

test('RIGID_3: このカードのすぐ下に裏向きで1枚プレイする', () => {
  let res = pz({ protos: A, lines: [[], [['RIGID_1', true]], []], hand: ['RIGID_3', 'FLEXIBLE_6'] }, { protos: B });
  res = drive(playUp(res, U0('RIGID_3'), 2), { discard: [] });
  assert.deepEqual(stack(res.state, 2, 0), [['FLEXIBLE_6', false], ['RIGID_3', true]]);
});

test('RIGID_2: アクションで裏向きにプレイしたら、デッキの一番上を同じスタックに裏向きで', () => {
  let res = pz({ protos: A, lines: [[['RIGID_2', true]], [], []], hand: ['FLEXIBLE_2'], deck: ['INERT_3', 'INERT_4'] }, { protos: B });
  res = drive(playDown(res, U0('FLEXIBLE_2'), 1), {});
  assert.deepEqual(stack(res.state, 1, 0), [['FLEXIBLE_2', false], ['INERT_3', false]]);
  let r2 = pz({ protos: A, lines: [[['RIGID_2', true]], [], []], hand: ['FLEXIBLE_6'], deck: ['INERT_3'] }, { protos: B });
  r2 = drive(playUp(r2, U0('FLEXIBLE_6'), 0), { discard: [] });
  assert.equal(r2.state.lines[1][0].length + r2.state.lines[2][0].length, 0, '表向きのプレイでは起きない');
});

test('RIGID_4: 裏向きのカードに覆われるときだけ、先に1枚引く', () => {
  let res = pz({ protos: A, lines: [[['RIGID_4', true]], [], []], hand: ['FLEXIBLE_2'], deck: ['INERT_3', 'INERT_4'] }, { protos: B });
  res = drive(playDown(res, U0('FLEXIBLE_2'), 0), {});
  assert.ok(res.state.players[0].hand.some(u => res.state.cards[u].def === 'INERT_3'));
  let r2 = pz({ protos: A, lines: [[], [], [['RIGID_4', true]]], hand: ['RIGID_5'], deck: ['INERT_3'] }, { protos: B });
  r2 = drive(playUp(r2, U0('RIGID_5'), 2), { discard: [] });
  assert.ok(!r2.state.players[0].hand.includes(U0('INERT_3')), '表向きで覆われても引かない');
});

test('FLEXIBLE_5: 終了時に2枚引いてよい。引いたらこのカードを裏にする', () => {
  let res = pz({ protos: A, lines: [[['FLEXIBLE_5', true]], [], []], hand: ['FLEXIBLE_2'], deck: ['INERT_3', 'INERT_4', 'INERT_5'] }, { protos: B });
  res = drive(playDown(res, U0('FLEXIBLE_2'), 1), { yesNo: [true] });
  assert.equal(res.state.cards[U0('FLEXIBLE_5')].faceUp, false);
  assert.equal(res.state.players[0].hand.length, 2);
});

test('FLEXIBLE_3 上段: 終了時、裏向きに覆われていればそれを移動できる', () => {
  let res = pz({ protos: A, lines: [[['FLEXIBLE_3', true]], [], []], hand: ['FLEXIBLE_2'] }, { protos: B });
  res = drive(playDown(res, U0('FLEXIBLE_2'), 0), { yesNo: [true], pickLine: [2] });
  assert.deepEqual(stack(res.state, 2, 0), [['FLEXIBLE_2', false]]);
  assert.deepEqual(stack(res.state, 0, 0), [['FLEXIBLE_3', true]]);
});

test('RIGID_6 上段: 終了時、相手が引くかプレイするかを選ぶ (手札が無ければ引く)', () => {
  let res = pz({ protos: A, lines: [[['RIGID_6', true]], [], []], hand: ['FLEXIBLE_2'] }, { protos: B, deck: ['WRATH_3'] });
  res = drive(playDown(res, U0('FLEXIBLE_2'), 1), {});
  assert.ok(res.state.players[1].hand.some(u => res.state.cards[u].def === 'WRATH_3'));
});

test('Aux 3 を入れたランダム対戦がエラーなく最後まで進む', () => {
  const sets = [A, ['FLEXIBLE', 'LUST', 'FIRE'], ['INERT', 'NOVA', 'WATER'], ['RIGID', 'GREED', 'DEATH'], ['INERT', 'ICE', 'SPEED']];
  for (let g = 0; g < 20; g++) {
    let res = Engine.newGame({ p0: sets[g % sets.length], p1: sets[(g + 2) % sets.length].map((n, i) => sets[(g + 2) % sets.length] === sets[g % sets.length] ? B[i] : n), seed: 300 + g, useControl: true });
    let rng = 11 + g;
    const rnd = (n) => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
    for (let step = 0; step < 400 && res.state.winner === null; step++) {
      if (res.requests.length) {
        const req = res.requests[0];
        res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: Engine.ai.answer(res.state, req) });
      } else {
        const acts = Engine.legalActions(res.state);
        res = Engine.apply(res.state, acts[rnd(acts.length)]);
      }
      assert.equal(res.error, null, `game ${g} step ${step}: ${res.error}`);
    }
  }
});
