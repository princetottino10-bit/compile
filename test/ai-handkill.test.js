'use strict';
/* 手筋 M3: 相手の手札を枯らして手番を奪う。
   手札が0枚の相手はプレイできる札が無く、次の自分のターンをリフレッシュに使わされる。
   AI がこの「1ターン奪う」価値を見ているか。 */
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
function setHand(st, side, defs) {
  const p = st.players[side];
  while (p.hand.length) { const u = p.hand.pop(); st.cards[u].zone = 'deck' + side; st.cards[u].knownTo = 0; p.deck.push(u); }
  for (const d of defs) {
    const u = uidOf(d, side);
    rm(p.deck, u);
    st.cards[u].zone = 'hand' + side; st.cards[u].knownTo = 1 << side; p.hand.push(u);
  }
}
function game() {
  return Engine.newGame({ p0: ['PLAGUE', 'DARKNESS', 'FIRE'], p1: ['METAL', 'LIGHT', 'WATER'], seed: 5, first: 0 }).state;
}

test('評価: 相手の手札を0枚にすると、1枚残すより価値が高い', () => {
  const base = game();
  setHand(base, 0, ['PLAGUE_3', 'FIRE_2']);

  const empty = structuredClone(base);
  setHand(empty, 1, []);
  const one = structuredClone(base);
  setHand(one, 1, ['METAL_2']);
  const two = structuredClone(base);
  setHand(two, 1, ['METAL_2', 'LIGHT_2']);

  const sEmpty = Engine.ai.score(empty, 0);
  const sOne = Engine.ai.score(one, 0);
  const sTwo = Engine.ai.score(two, 0);

  /* 1枚 → 0枚 は「相手のターンを1つ奪う」ので、
     2枚 → 1枚 のような単なる1枚差より大きく効くはず */
  assert.ok(sEmpty > sOne, '0枚のほうが良い');
  assert.ok(sEmpty - sOne > (sOne - sTwo) * 2,
    `手番を奪う価値が見えていない (0枚との差 ${(sEmpty - sOne).toFixed(1)} / 1枚差 ${(sOne - sTwo).toFixed(1)})`);
});

test('評価: 自分の手札が0枚になるのは、相手の手札が0枚になるより嬉しくない', () => {
  const base = game();
  const mineEmpty = structuredClone(base);
  setHand(mineEmpty, 0, []);
  setHand(mineEmpty, 1, ['METAL_2']);
  const theirsEmpty = structuredClone(base);
  setHand(theirsEmpty, 0, ['PLAGUE_3']);
  setHand(theirsEmpty, 1, []);
  assert.ok(Engine.ai.score(theirsEmpty, 0) > Engine.ai.score(mineEmpty, 0));
});

test('選択: 相手の手札を全部捨てさせる効果を、AI が選ぶ', () => {
  const st = game();
  /* PLAGUE 2 の中段: 自分が捨てた枚数+1 を相手が捨てる。
     手札3枚から2枚捨てれば、相手の3枚を全部落として手番を奪える */
  setHand(st, 0, ['PLAGUE_3', 'FIRE_2', 'FIRE_3']);
  setHand(st, 1, ['METAL_2', 'LIGHT_2', 'WATER_2']);
  st.turn = 0;
  st.phase = 'action';
  const acts = Engine.legalActions(st).filter(a => a.type === 'play' && a.card === uidOf('PLAGUE_3', 0) && a.faceUp);
  assert.ok(acts.length, 'PLAGUE_3 を表でプレイできる編成にすること');
  const chosen = Engine.ai.action(st);
  assert.equal(chosen && chosen.type, 'play');
  assert.equal(chosen.card, uidOf('PLAGUE_3', 0));
  assert.equal(chosen.faceUp, true, '手札を枯らせる中段を表で使う');
});
