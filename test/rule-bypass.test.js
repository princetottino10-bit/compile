'use strict';
/* 文面が「引く・捨て札にする・戻す・プレイする」なのに、ふつうの手順を通らず
   「〜したあと」の効果や「〜できない」制限が効いていなかったもの (2026-09-27 に見つけて直した) */
const { test } = require('node:test');
const assert = require('node:assert');
const Engine = require('../engine.js');
Engine.init(require('../data/cards.json'), require('../data/effects.json'));

function pz(s0, s1) {
  const r = Engine.newPuzzle({ sides: [Object.assign({ lines: [[], [], []], hand: [] }, s0), Object.assign({ lines: [[], [], []], hand: [] }, s1)] }, { seed: 1 });
  assert.equal(r.error, null);
  return r;
}
function drive(res, ans) {
  for (let n = 0; res.requests.length; n++) {
    assert.ok(n < 40, '選択が終わらない');
    const q = res.requests[0];
    const p = ans(q);
    assert.notEqual(p, undefined, '想定外の選択: ' + JSON.stringify(q));
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks: p });
    assert.equal(res.error, null);
  }
  return res;
}
function act(res, a) { const r = Engine.apply(res.state, a); assert.equal(r.error, null, r.error); return r; }
const firstOrNone = (q) => (q.kind === 'pickHand' || q.kind === 'pickCard' ? [q.candidates[0]] : q.kind === 'yesNo' ? [] : q.kind === 'option' ? [0] : undefined);

test('LOVE 3「相手の手札から1枚引く」も、ICE 6 (引けない) が効いていれば引けない', () => {
  let r = pz({ protos: ['LOVE', 'ICE', 'FIRE'], lines: [[], [['ICE_6', true]], []], hand: ['LOVE_3', 'FIRE_2'] },
    { protos: ['DARKNESS', 'WATER', 'SPIRIT'], hand: ['WATER_6'] });
  r = act(r, { type: 'play', card: 'p0:LOVE_3', line: 0, faceUp: true });
  r = drive(r, firstOrNone);
  assert.ok(r.state.players[1].hand.includes('p1:WATER_6'), '相手の札は取られない');
});

test('ASSIMILATION 2「手札を捨て札にし、相手の捨て札置き場に置く」は捨てたことになる (CORRUPTION 3 が起きる)', () => {
  let r = pz({ protos: ['ASSIMILATION', 'CORRUPTION', 'FIRE'], lines: [[['ASSIMILATION_2', true]], [['CORRUPTION_3', true]], []], hand: ['FIRE_2'] },
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['WATER_6', 'WATER_5'] });
  r = act(r, { type: 'refresh' });
  r = drive(r, firstOrNone);
  /* CORRUPTION 3「あなたが捨て札にしたあと: 相手は手札を1枚捨て札にする」 */
  assert.ok(r.state.players[1].trash.some(u => u.startsWith('p1:')), '相手も1枚捨てる: ' + JSON.stringify(r.state.players[1].trash));
});

test('WATER 4 でまとめて戻すときも、CORRUPTION 2 で相手のデッキの一番上へ行く', () => {
  let r = pz({ protos: ['WATER', 'CORRUPTION', 'FIRE'], lines: [[], [['CORRUPTION_2', true]], []], hand: ['WATER_4'] },
    { protos: ['DARKNESS', 'PLAGUE', 'SPIRIT'], lines: [[], [], [['SPIRIT_3', true]]], hand: [] });
  r = act(r, { type: 'play', card: 'p0:WATER_4', line: 0, faceUp: true });
  r = drive(r, (q) => (q.kind === 'pickLine' ? [2] : undefined));
  assert.equal(r.state.players[1].hand.length, 0);
  assert.equal(r.state.players[1].deck[0], 'p1:SPIRIT_3');
});

test('ASSIMILATION 3 のデッキからのプレイも、PLAGUE 1 (このラインにプレイできない) を守る', () => {
  let r = pz({ protos: ['ASSIMILATION', 'FIRE', 'WATER'], lines: [[['ASSIMILATION_3', true]], [], []], hand: ['FIRE_2'] },
    { protos: ['PLAGUE', 'DARKNESS', 'SPIRIT'], lines: [[['PLAGUE_1', true]], [], []], hand: [] });
  r = act(r, { type: 'play', card: 'p0:FIRE_2', line: 1, faceUp: false });
  r = drive(r, firstOrNone);
  assert.deepEqual(r.state.lines[0][0], ['p0:ASSIMILATION_3']);
});

test('ASSIMILATION 6 は METAL 3 (このラインに裏向きでプレイできない) のラインを選べない', () => {
  let r = pz({ protos: ['ASSIMILATION', 'FIRE', 'WATER'], lines: [[['ASSIMILATION_6', true]], [], []], hand: ['FIRE_2'] },
    { protos: ['METAL', 'ICE', 'SPIRIT'], lines: [[['METAL_3', true]], [['ICE_1', true]], []], hand: [] });
  r = act(r, { type: 'play', card: 'p0:FIRE_2', line: 2, faceUp: false });
  const lines = [];
  r = drive(r, (q) => { if (q.kind === 'pickLine') { lines.push(...q.lines); return [q.lines[0]]; } return firstOrNone(q); });
  assert.ok(!lines.includes(0), '0 のラインは候補に出ない');
  assert.deepEqual(r.state.lines[0][1], ['p1:METAL_3']);
});

test('CORRUPTION 1 を相手側に出すときも、PLAGUE 1 のラインには出せない', () => {
  const r = pz({ protos: ['CORRUPTION', 'FIRE', 'WATER'], hand: ['CORRUPTION_1', 'WATER_6'] },
    { protos: ['PLAGUE', 'ICE', 'SPIRIT'], lines: [[['PLAGUE_1', true]], [], []], hand: [] });
  const opp = Engine.legalActions(r.state).filter(a => a.card === 'p0:CORRUPTION_1' && a.side === 1);
  assert.ok(opp.length > 0 && opp.every(a => a.line !== 0));
  assert.ok(Engine.apply(r.state, { type: 'play', card: 'p0:CORRUPTION_1', line: 0, faceUp: false, side: 1 }).error);
});
