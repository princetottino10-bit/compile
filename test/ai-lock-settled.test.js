'use strict';
/* 相手のサイキック①のロックのラインに出し続けて割る手筋 (全 CPU) と、その止めどころ。
   相手がそのラインを10以上で上回っていて、出しても届かない (次の開始でコンパイルされる) ときは、
   裏で張り合わずにほかのラインかリフレッシュにする (ユーザー 2026-10-15、ぱうぷる戦1局目の43手目)。
   棋譜: ぱうぷるさん (PSYCHIC/DARKNESS/DIVERSITY) と ORACLE (FIRE/WATER/SPEED) のオンライン対戦 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'))
);

/* 棋譜を、n 番目のプレイ (リフレッシュも数える) の直前まで進める */
function stateBefore(n) {
  const rep = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'paupuru-lock-1.json'), 'utf8'));
  let res = Engine.newGame({ seed: rep.init.seed, p0: rep.init.p0, p1: rep.init.p1, first: rep.init.first });
  let k = 0;
  for (const a of rep.actions) {
    if (a.type === 'play' || a.type === 'refresh') { k++; if (k === n) break; }
    res = Engine.apply(res.state, a);
  }
  return res.state;
}

test('ロックのライン: 相手が届かない合計で張り合わないなら、出し続ける (上乗せ)', () => {
  Engine.setAiLevel(2);
  const st = stateBefore(29);   // ロックされたライン1 は 自分0 / 相手7
  assert.equal(st.turn, 0);
  const hand = st.players[0].hand;
  const bias = Engine.ai.actionBias(st, { type: 'play', card: hand[0], line: 0, faceUp: false }, 0);
  assert.ok(bias > 0, 'ロックのラインへの上乗せ: ' + bias);
});

test('ロックのライン: 相手のコンパイルが確定したら、裏で張り合わない', () => {
  Engine.setAiLevel(2);
  const st = stateBefore(40);   // ライン1 は 自分4 / 相手10。手札は裏でしか出せない2枚
  assert.equal(st.turn, 0);
  const hand = st.players[0].hand;
  for (const card of hand) {
    const into = Engine.ai.actionBias(st, { type: 'play', card, line: 0, faceUp: false }, 0);
    const other = Engine.ai.actionBias(st, { type: 'play', card, line: 1, faceUp: false }, 0);
    assert.ok(into < other, card + ': ロックのライン ' + into + ' / ほかのライン ' + other);
  }
});
