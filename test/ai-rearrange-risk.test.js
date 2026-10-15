'use strict';
/* 相手に並べ替えられて、10以上にしたラインへ済みのプロトコルを持ってこられると、コンパイルはリコンパイルになる。
   相手のコントロールや、相手の PSYCHIC 2 / CHAOS 1 があるときは、コンパイルが通る見込みを割り引く (ユーザー 2026-10-15) */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'))
);

function rm(a, x) { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); }
function put(st, uid, line, side) {
  for (const p of st.players) { rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid); }
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) rm(st.lines[l][s], uid);
  st.lines[line][side].push(uid);
  st.cards[uid].faceUp = true;
  st.cards[uid].zone = 'line';
}
/* 自分 (0) は FIRE を済みにして、ライン2 (WATER) を 10 以上に。相手 (1) の番 */
function board(oppDeck, opts) {
  const st = Engine.newGame({ seed: 7, p0: ['FIRE', 'WATER', 'SPEED'], p1: oppDeck, first: 0 }).state;
  st.players[0].protocols[0].compiled = true;
  for (const d of ['WATER_6', 'WATER_5', 'WATER_4']) put(st, 'p0:' + d, 1, 0);
  st.turn = 1;
  st.useControl = true;
  st.control = opts.control;
  return st;
}

test('相手のコントロール: 済みのプロトコルを持ってこられるので、通る見込みを割り引く', () => {
  const free = Engine.ai.compilePassChance(board(['LIFE', 'LIGHT', 'METAL'], { control: -1 }), 0, 1, 0);
  const ctrl = Engine.ai.compilePassChance(board(['LIFE', 'LIGHT', 'METAL'], { control: 1 }), 0, 1, 0);
  assert.ok(free > 0);
  assert.ok(ctrl < free * 0.5, 'コントロールなし ' + free + ' / あり ' + ctrl);
});

test('相手が PSYCHIC / CHAOS: 並べ替えの札を持っている見込みのぶん割り引く', () => {
  const plain = Engine.ai.compilePassChance(board(['LIFE', 'LIGHT', 'METAL'], { control: -1 }), 0, 1, 0);
  const psy = Engine.ai.compilePassChance(board(['PSYCHIC', 'CHAOS', 'METAL'], { control: -1 }), 0, 1, 0);
  assert.ok(psy < plain, 'ふつう ' + plain + ' / PSYCHIC・CHAOS ' + psy);
});
