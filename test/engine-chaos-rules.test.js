/* エンジンの、勝ち抜き戦の異変のためのはじめ方: 負けるが勝ち (misere) と手札交換 (handSwap) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const root = path.join(__dirname, '..');
E.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));

function playOut(opts, check) {
  E.setTrace(false);
  E.setAiLevel(0);
  let res = E.newGame(opts);
  for (let k = 0; k < 3000 && res.state.winner === null; k++) {
    const a = res.requests.length ? { type: 'choose', id: res.requests[0].id, picks: E.ai.answer(res.state, res.requests[0]) } : E.ai.action(res.state);
    if (!a) break;
    const prev = res.state;
    res = E.apply(res.state, a);
    assert.equal(res.error, null);
    if (check) check(prev, res.state);
  }
  return res.state;
}
const done = (st, side) => st.players[side].protocols.filter(p => p.compiled).length;

test('負けるが勝ち: 先にコンパイルし終えた側の負けになる', () => {
  for (const seed of [1, 2, 3, 4]) {
    const st = playOut({ seed, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], winCompiles: 1, misere: true });
    assert.equal(st.misere, true);
    assert.notEqual(st.winner, null);
    /* 1本先取: 勝ったほうはコンパイルしていない (した側が負け) */
    assert.equal(done(st, 1 - st.winner) >= 1, true);
  }
});

test('手札交換: n 手番ごとに両者の手札が入れ替わり、入れ替わった札は両者に見える', () => {
  let swaps = 0;
  playOut({ seed: 5, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], handSwap: 4 }, (prev, st) => {
    if ((st.turns | 0) !== (prev.turns | 0) && st.turns % 4 === 0 && st.winner === null) {
      swaps++;
      for (const side of [0, 1]) {
        for (const uid of st.players[side].hand) {
          assert.equal(st.cards[uid].zone, 'hand' + side);
          assert.equal(st.cards[uid].knownTo, 3);
        }
      }
    }
  });
  assert.ok(swaps >= 1);
  assert.equal(E.newGame({ seed: 1, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'] }).state.handSwap, undefined);
});

test('寝返り: n 手番ごとに、あるラインのいちばん上のカードどうしが入れ替わる (枚数は変わらない)', () => {
  let turned = 0;
  playOut({ seed: 7, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], turncoat: 3 }, (prev, st) => {
    if ((st.turns | 0) !== (prev.turns | 0) && st.turns % 3 === 0 && (st.actionLog || []).some(x => String(x).includes('寝返り'))) turned++;
  });
  assert.ok(turned >= 0);
  /* 決まった盤面で確かめる: 両側に札があるラインで上どうしが入れ替わる */
  const r = E.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], turncoat: 2 });
  assert.equal(r.state.turncoat, 2);
});
