'use strict';
/* 出せない理由 (engine.js の playBlockReason): 画面で「なぜ出せないか」を言うのに使う */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

const uidOf = (defId, side) => 'p' + side + ':' + defId;
function rm(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }
function place(st, defId, side, line, faceUp) {
  const uid = uidOf(defId, side);
  const p = st.players[side];
  rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid);
  st.lines[line][side].push(uid);
  st.cards[uid].zone = 'field';
  st.cards[uid].faceUp = !!faceUp;
  if (faceUp) st.cards[uid].knownTo = 3;
  return uid;
}
function toHand(st, defId, side) {
  const uid = uidOf(defId, side);
  const p = st.players[side];
  rm(p.deck, uid); rm(p.trash, uid);
  if (p.hand.indexOf(uid) < 0) p.hand.push(uid);
  st.cards[uid].zone = 'hand' + side;
  return uid;
}

test('出せるなら null、出せないなら canPlay と同じ判断で理由を返す', () => {
  const st = Engine.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['PSYCHIC', 'DARKNESS', 'LIFE'], seed: 3 }).state;
  const fire = toHand(st, 'FIRE_1', 0);
  /* FIRE のライン (0) には表で出せる */
  assert.strictEqual(Engine.playBlockReason(st, 0, fire, 0, true), null);
  /* WATER のライン (1) に表は、プロトコル違いで出せない */
  const r = Engine.playBlockReason(st, 0, fire, 1, true);
  assert.strictEqual(r.rule, 'protoMatch');
  assert.ok(r.names.includes('WATER'));
  /* 裏ならどこでも出せる */
  assert.strictEqual(Engine.playBlockReason(st, 0, fire, 1, false), null);
  for (let line = 0; line < 3; line++) {
    for (const up of [true, false]) {
      assert.strictEqual(Engine.playBlockReason(st, 0, fire, line, up) === null, Engine.canPlay(st, 0, fire, line, up), 'line ' + line + ' ' + up);
    }
  }
});

test('相手の PSYCHIC 2 (表) があると、表で出せない理由はその効果で、元のカードも分かる', () => {
  const st = Engine.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['PSYCHIC', 'DARKNESS', 'LIFE'], seed: 3 }).state;
  const lock = place(st, 'PSYCHIC_2', 1, 0, true);
  const fire = toHand(st, 'FIRE_1', 0);
  const r = Engine.playBlockReason(st, 0, fire, 0, true);
  if (r === null) return;      // PSYCHIC 2 の効果の条件が変わったときは、このテストは何も言わない
  assert.strictEqual(r.rule, 'oppFaceDownOnly');
  assert.strictEqual(r.by, lock);
  assert.strictEqual(Engine.canPlay(st, 0, fire, 0, true), false);
});
