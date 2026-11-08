'use strict';
/* ぱうぷるの棋譜で見つけたコンボを CPU が狙えるか (2026-11-08、ユーザー「全部狙おう」)。値の表記 (内部 id は値 + 1)。
   - WATER 4 を表の HATE 1 に重ねて自分を戻し、HATE 1 を起こし直す
   - HATE 0・HATE 2 で HATE 1 の上の自分を消して起こし直す
   - PSYCHIC 0 の上の裏向きを DARKNESS 4 でどかして起こし直す
   - GLUTTONY 2 で引きすぎてキャッシュクリアし、GLUTTONY 0 の上段を入れる */
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
function detach(st, uid) {
  for (const p of st.players) { rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid); }
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) rm(st.lines[l][s], uid);
}
function place(st, def, side, line, faceUp) {
  const uid = uidOf(def, side);
  detach(st, uid);
  st.lines[line][side].push(uid);
  Object.assign(st.cards[uid], { zone: 'field', faceUp: !!faceUp, knownTo: faceUp ? 3 : (1 << side) });
}
function setHand(st, side, defs) {
  const p = st.players[side];
  while (p.hand.length) { const u = p.hand.pop(); Object.assign(st.cards[u], { zone: 'deck' + side, knownTo: 0 }); p.deck.push(u); }
  for (const d of defs) {
    const u = uidOf(d, side);
    detach(st, u);
    Object.assign(st.cards[u], { zone: 'hand' + side, knownTo: 1 << side });
    p.hand.push(u);
  }
}
function game(p0, p1) {
  const st = Engine.newGame({ p0, p1, seed: 3, first: 0 }).state;
  st.turn = 0;
  st.phase = 'action';
  return st;
}
function withOracle(fn) {
  Engine.setAiLevel(2);
  Engine.setAiSpecialist(true, 0, 'dsh');
  Engine.setAiOracle(true);
  try { return fn(); } finally { Engine.setAiOracle(false); Engine.setAiSpecialist(false); }
}
function resolveWithAi(res, answers) {
  for (let g = 0; res && !res.error && res.requests.length && g < 40; g++) {
    const q = res.requests[0];
    const picks = Engine.ai.answer(res.state, q);
    if (answers) answers.push({ q, picks: picks.map(u => res.state.cards[u] ? res.state.cards[u].def : u) });
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks });
  }
  return res;
}

/* 自分 HATE/SPIRIT/WATER、相手 WATER/FIRE/SPEED。ライン0 は HATE と WATER なので WATER 4 を表で重ねられる */
function hateBoard(hand) {
  const st = game(['HATE', 'SPIRIT', 'WATER'], ['WATER', 'FIRE', 'SPEED']);
  place(st, 'HATE_2', 0, 0, true);
  place(st, 'WATER_3', 1, 0, true);
  place(st, 'FIRE_4', 1, 1, true);
  place(st, 'SPEED_3', 1, 2, true);
  place(st, 'FIRE_2', 1, 1, false);
  setHand(st, 0, hand);
  return st;
}

test('ORACLE は WATER 4 を表の HATE 1 に重ね、自分を戻して HATE 1 をもう一度起動する', () => withOracle(() => {
  const st = hateBoard(['WATER_5', 'SPIRIT_6', 'WATER_6', 'HATE_5', 'SPIRIT_3']);
  Engine.setAiThinkBudget(1500);
  const act = Engine.ai.action(st);
  assert.deepEqual(act, { type: 'play', card: uidOf('WATER_5', 0), line: 0, faceUp: true }, '実際: ' + JSON.stringify(act));
  const res = resolveWithAi(Engine.apply(st, act));
  assert.ok(res.log.some(l => /^\[HATE_2\] 中段コマンド解決 \(uncover\)/.test(l)), 'HATE 1 が起き直す');
  assert.ok(res.state.players[0].hand.includes(uidOf('WATER_5', 0)), 'WATER 4 は手札に帰る');
}));

/* 捨てる札を選ぶとき、場の相方が効いている組の札は手放さない。
   (HATE 2 は、場に自分の HATE 2 より大きい札があると自分を選べず起こし直せないので、ここでは試さない) */
const KEEP = [
  { name: 'HATE 1 が表なら WATER 4', protos: ['HATE', 'SPIRIT', 'WATER'], field: ['HATE_2', 0], keep: 'WATER_5', fodder: ['SPIRIT_3', 'HATE_5'] },
  { name: 'PSYCHIC 0 が表なら DARKNESS 4', protos: ['PSYCHIC', 'DARKNESS', 'WATER'], field: ['PSYCHIC_1', 0], keep: 'DARKNESS_5', fodder: ['PSYCHIC_4', 'WATER_4'] },
  { name: 'GLUTTONY 0 が表なら GLUTTONY 2', protos: ['GLUTTONY', 'PRIDE', 'WATER'], field: ['GLUTTONY_1', 0], keep: 'GLUTTONY_3', fodder: ['PRIDE_4', 'WATER_4'] }
];
for (const k of KEEP) {
  test('捨てる札に組の札を選ばない: ' + k.name, () => withOracle(() => {
    const st = game(k.protos, ['METAL', 'LIFE', 'SPEED']);
    place(st, k.field[0], 0, k.field[1], true);
    place(st, 'METAL_4', 1, 0, true);
    place(st, 'LIFE_4', 1, 1, true);
    /* WATER 5 (WATER_6) は表で出すと手札を1枚捨てる */
    setHand(st, 0, ['WATER_6', k.keep].concat(k.fodder));
    Engine.setAiThinkBudget(300);
    const answers = [];
    resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('WATER_6', 0), line: 2, faceUp: true }), answers);
    const disc = answers.find(a => /discard/.test(a.q.prompt || ''));
    assert.ok(disc, '捨てる札を聞かれる (' + JSON.stringify(answers.map(a => a.q.prompt)) + ')');
    assert.ok(!disc.picks.includes(k.keep), k.keep + ' を捨てた: ' + JSON.stringify(disc.picks));
  }));
}

/* 揃えに行く値打ち: 相方が場で効いているとき、WATER 4 は別のラインに置いて場に残すより手札に持つ方を高く見る
   (出しても戻って使い回す札 'again' は、場に残ると回しが切れる) */
test('HATE 1 が表なら、WATER 4 を場に残すより手札に持つ形を高く見る', () => {
  Engine.setAiLevel(2);
  const inHand = hateBoard(['WATER_5', 'SPIRIT_3']);
  const onField = hateBoard(['SPIRIT_3']);
  place(onField, 'WATER_5', 0, 2, true);
  const noHate = (st) => { place(st, 'HATE_2', 0, 1, false); return st; };
  const gain = Engine.ai.score(inHand, 0) - Engine.ai.score(onField, 0);
  const gainNoHate = Engine.ai.score(noHate(hateBoard(['WATER_5', 'SPIRIT_3'])), 0) - Engine.ai.score((() => { const s = noHate(hateBoard(['SPIRIT_3'])); place(s, 'WATER_5', 0, 2, true); return s; })(), 0);
  assert.ok(gain - gainNoHate >= 100, 'HATE 1 が表のときだけ手札の WATER 4 に回しの値打ちが付く (差 ' + (gain - gainNoHate).toFixed(1) + ')');
});
