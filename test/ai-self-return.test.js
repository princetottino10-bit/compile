'use strict';
/* WATER 4 (WATER_5「あなたのカードを1枚戻す」) で、ほかに戻せるカードがあるのに WATER 4 自身を戻さない */
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
const rm = (a, x) => { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); };
function place(st, def, side, line, faceUp) {
  const uid = uidOf(def, side), p = st.players[side];
  rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid);
  st.lines[line][side].push(uid);
  Object.assign(st.cards[uid], { zone: 'field', faceUp: !!faceUp, knownTo: faceUp ? 3 : (1 << side) });
  return uid;
}
function toHand(st, def, side) {
  const uid = uidOf(def, side), p = st.players[side];
  rm(p.deck, uid); p.hand.push(uid);
  Object.assign(st.cards[uid], { zone: 'hand' + side, knownTo: 1 << side });
  return uid;
}

for (const level of [1, 2]) {
  test('WATER 4 は自分自身を戻さない (AI レベル ' + level + ')', () => {
    Engine.setAiLevel(level);
    Engine.setAiThinkBudget(60);
    const st = Engine.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['HATE', 'WAR', 'PSYCHIC'], seed: 11, first: 0 }).state;
    st.phase = 'action';
    place(st, 'FIRE_3', 0, 0, true);        // 戻せるほかのカード
    place(st, 'SPEED_2', 0, 2, false);
    const w4 = toHand(st, 'WATER_5', 0);
    let res = Engine.apply(st, { type: 'play', card: w4, line: 1, faceUp: true });
    assert.equal(res.error, null);
    let guard = 0;
    while (res.requests.length && guard++ < 10) {
      const q = res.requests[0];
      const picks = Engine.ai.answer(res.state, q);
      if (q.prompt === 'return') assert.ok(!picks.includes(w4), 'WATER 4 自身を戻した: ' + JSON.stringify(picks));
      res = Engine.apply(res.state, { type: 'choose', id: q.id, picks });
      assert.equal(res.error, null);
    }
    assert.ok(res.state.lines[1][0].includes(w4), 'WATER 4 は場に残る');
  });
}
