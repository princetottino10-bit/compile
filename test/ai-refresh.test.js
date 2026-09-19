'use strict';
/* リフレッシュの判断: 相手がコンパイル圏に届いているのに手を止めると、そのまま通される。
   悪手マイニング (505局面) で、リフレッシュを選んで負けた局面が6件あった型。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'))
);

const uidOf = (def, side) => 'p' + side + ':' + def;
function rm(a, x) { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); }
function place(st, def, side, line, faceUp) {
  const uid = uidOf(def, side), p = st.players[side];
  rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid);
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) rm(st.lines[l][s], uid);
  st.lines[line][side].push(uid);
  st.cards[uid].zone = 'field';
  st.cards[uid].faceUp = !!faceUp;
  st.cards[uid].knownTo = faceUp ? 3 : (1 << side);
}
function setHand(st, side, defs) {
  const p = st.players[side];
  while (p.hand.length) { const u = p.hand.pop(); st.cards[u].zone = 'deck' + side; st.cards[u].knownTo = 0; p.deck.push(u); }
  for (const d of defs) {
    const u = uidOf(d, side);
    rm(p.deck, u);
    st.cards[u].zone = 'hand' + side; st.cards[u].knownTo = 1 << side; p.hand.push(u);
  }
}

test('相手がコンパイル圏に届いているとき、AI はリフレッシュで手を止めない', () => {
  const st = Engine.newGame({ p0: ['HATE', 'LOVE', 'APATHY'], p1: ['LIGHT', 'SPIRIT', 'GRAVITY'], seed: 11, first: 0 }).state;
  /* 相手のライン2が9点 — 次のターンに通される */
  place(st, 'GRAVITY_6', 1, 2, true);
  place(st, 'GRAVITY_5', 1, 2, true);
  setHand(st, 0, ['HATE_5']);          // 手札1枚: 引きたくはあるが、止まっている場合ではない
  st.turn = 0;
  st.phase = 'action';

  const theirs = st.lines[2][1].reduce((n, u) => n + Engine.defs[st.cards[u].def].value, 0);
  assert.ok(theirs >= 8, '相手のラインがコンパイル圏にある前提 (' + theirs + ')');

  Engine.setAiLevel(1);
  const act = Engine.ai.action(st);
  assert.ok(act, '手を返すこと');
  assert.notEqual(act.type, 'refresh', 'コンパイル圏を放置してリフレッシュしない');
});

test('盤面が落ち着いていれば、手札が少ないときのリフレッシュは選べる', () => {
  const st = Engine.newGame({ p0: ['HATE', 'LOVE', 'APATHY'], p1: ['LIGHT', 'SPIRIT', 'GRAVITY'], seed: 11, first: 0 }).state;
  setHand(st, 0, []);                  // 手札0枚ならリフレッシュ以外にできることがない
  st.turn = 0;
  st.phase = 'action';
  Engine.setAiLevel(1);
  const act = Engine.ai.action(st);
  assert.equal(act && act.type, 'refresh');
});
