/* 問題の共有: 盤面 → リンクのコード → 盤面 で元に戻ること、判定が条件どおりであること */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Engine = require('../engine.js');

Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects.json'), 'utf8'))
);

const loadPz = () => import('../js3d/puzzle.js');

function lineTotal(st, line, side) {
  return st.lines[line][side].reduce((n, u) => n + (st.cards[u].faceUp ? +st.cards[u].def.split('_')[1] - 1 : 2), 0);
}

function trainingBoard() {
  const res = Engine.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'METAL', 'HATE'], seed: 5, training: true });
  let st = res.state;
  const act = (a) => { const r = Engine.apply(st, a); assert.equal(r.error, null); st = r.state; };
  act({ type: 'trainingPlace', card: 'p0:FIRE_3', line: 0, faceUp: true });
  act({ type: 'trainingPlace', card: 'p0:WATER_4', line: 1, faceUp: false });
  act({ type: 'trainingPlace', card: 'p1:METAL_5', line: 1, faceUp: true });
  act({ type: 'trainingMove', card: 'p0:SPEED_2', to: 'hand' });
  act({ type: 'trainingMove', card: 'p0:FIRE_6', to: 'hand' });
  act({ type: 'trainingMove', card: 'p1:HATE_2', to: 'trash' });
  return st;
}

test('問題: 盤面をコードにして戻すと、場・手札・捨て札・山札の順番まで同じになる', async () => {
  const PZ = await loadPz();
  const st = trainingBoard();
  const code = PZ.encodePuzzle(st, 'このターンで FIRE をコンパイルできる状態に', 'ready');
  assert.ok(code.length < 1200, 'リンクが長すぎない (' + code.length + ' 文字)');
  const pz = PZ.decodePuzzle(code);
  assert.equal(pz.task, 'このターンで FIRE をコンパイルできる状態に');
  assert.equal(pz.goal, 'ready');
  const res = Engine.newPuzzle(pz.spec, { seed: 1 });
  assert.equal(res.error, null);
  const back = res.state;
  assert.equal(back.turn, 0, '自分 (P1) の手番から始まる');
  for (let p = 0; p < 2; p++) {
    for (let l = 0; l < 3; l++) {
      assert.deepEqual(back.lines[l][p].map(u => [back.cards[u].def, back.cards[u].faceUp]),
        st.lines[l][p].map(u => [st.cards[u].def, st.cards[u].faceUp]), 'ライン ' + l + ' / P' + (p + 1));
    }
    assert.deepEqual(back.players[p].hand.map(u => back.cards[u].def).sort(), st.players[p].hand.map(u => st.cards[u].def).sort());
    assert.deepEqual(back.players[p].trash.map(u => back.cards[u].def), st.players[p].trash.map(u => st.cards[u].def));
  }
  assert.deepEqual(back.players[0].deck.map(u => back.cards[u].def), st.players[0].deck.map(u => st.cards[u].def), '山札の順番');
});

test('問題: 壊れたリンクは null', async () => {
  const PZ = await loadPz();
  assert.equal(PZ.decodePuzzle('!!!'), null);
  assert.equal(PZ.decodePuzzle(''), null);
});

test('問題の判定: コンパイルできる状態 / 相手を止める / 勝利', async () => {
  const PZ = await loadPz();
  const st = trainingBoard();
  const total = (s, l, side) => lineTotal(s, l, side);
  /* FIRE 2 (表) だけでは 10 に届かない */
  assert.equal(PZ.judgePuzzle('ready', st, st, 0, total).ok, false);
  const fake = JSON.parse(JSON.stringify(st));
  const total10 = (s, l, side) => (s === fake && l === 0 && side === 0 ? 10 : lineTotal(s, l, side));
  assert.equal(PZ.judgePuzzle('ready', fake, fake, 0, total10).ok, true);
  assert.equal(PZ.judgePuzzle('block', st, st, 0, total).ok, true, '相手にコンパイルできるラインが無ければ正解');
  const won = { ...st, winner: 0 };
  assert.equal(PZ.judgePuzzle('win', st, won, 0, total).ok, true);
  assert.equal(PZ.judgePuzzle('none', st, st, 0, total).ok, null);
});
