'use strict';
/* 裁定: 相手の側に置いたカードは、置いた時点で相手のカードになる。
   盤面にいる間も、削除・戻すなどで場を離れたあとも、新しい持ち主のまま */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const root = path.join(__dirname, '..');
E.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));

function board(hand0) {
  return E.newPuzzle({ sides: [
    { protos: ['CORRUPTION', 'FIRE', 'WATER'], hand: hand0 },
    { protos: ['DEATH', 'METAL', 'SPEED'] }
  ] });
}

test('CORRUPTION 0 を相手の側にプレイすると、その時点で相手のカードになる', () => {
  const r = board(['CORRUPTION_1']);
  const uid = 'p0:CORRUPTION_1';
  const res = E.apply(r.state, { type: 'play', card: uid, line: 1, faceUp: false, side: 1 });
  assert.equal(res.error, null);
  assert.ok(res.state.lines[1][1].includes(uid), '相手の側のスタックにある');
  assert.equal(res.state.cards[uid].owner, 1, '持ち主が相手に変わる');
  /* 裏向きで置いたカードは、置かれた側のプレイヤーが中身を見られる */
  assert.ok(res.state.cards[uid].knownTo & 2);
});

test('自分の側にプレイしたカードは、持ち主が変わらない', () => {
  const r = board(['CORRUPTION_1']);
  const uid = 'p0:CORRUPTION_1';
  const res = E.apply(r.state, { type: 'play', card: uid, line: 0, faceUp: true });
  assert.equal(res.error, null);
  assert.equal(res.state.cards[uid].owner, 0);
});
