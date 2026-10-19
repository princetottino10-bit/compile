'use strict';
/* ヘイト① (HATE_2: 手札3枚を捨てて2枚削除) の撃ち直し。ヘイト② (HATE_3) を表のヘイト①の上に出し、
   「値が最も大きい自分のカード」に自分を選んで消すと、めくれたヘイト①がもう一度起動する
   (ヘイト③ HATE_4 の上段があれば削除のたびに引く)。ぱうぷるの指摘 (2026-10-15): 相手がこの形なら、
   ファイア③の終了時の反転で表のヘイト①を裏にして止める。手札が見えているならなおさら */
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
  return uid;
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
/* スクショの盤面: ALL-SEEING (側1) は一番上に表のファイア③。相手 (側0) は HATE のラインに表のヘイト①だけ、
   WATER のラインはスピリット①・ヘイト③の上に裏向き (ヘイト⓪)。相手の手札にヘイト② */
function board() {
  const st = Engine.newGame({ p0: ['WATER', 'HATE', 'SPIRIT'], p1: ['PSYCHIC', 'FIRE', 'DARKNESS'], seed: 5, first: 1 }).state;
  place(st, 'FIRE_4', 1, 1, true);
  place(st, 'FIRE_5', 1, 2, true);
  place(st, 'DARKNESS_2', 1, 2, false);
  place(st, 'SPIRIT_2', 0, 0, true);
  place(st, 'HATE_4', 0, 0, true);
  place(st, 'HATE_1', 0, 0, false);
  place(st, 'HATE_2', 0, 1, true);
  setHand(st, 0, ['HATE_3', 'SPIRIT_5', 'WATER_5']);
  setHand(st, 1, ['DARKNESS_6', 'PSYCHIC_6', 'FIRE_6', 'DARKNESS_1', 'FIRE_3']);
  return st;
}
function drain(res, side) {
  let guard = 0;
  const picks = [];
  while (res.requests.length && guard++ < 20) {
    const req = res.requests[0];
    const p = Engine.ai.answer(res.state, req);
    if (req.player === side) picks.push({ req, picks: p.map(u => res.state.cards[u] ? res.state.cards[u].def : u) });
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: p });
    assert.equal(res.error, null);
  }
  return { state: res.state, picks };
}

test('ヘイト①の撃ち直し: ヘイト②を表のヘイト①の上に出したら、削除に自分を選んでヘイト①をもう一度起動する', () => {
  const st = board();
  st.turn = 0;
  const { picks } = drain(Engine.apply(st, { type: 'play', card: uidOf('HATE_3', 0), line: 1, faceUp: true }), 0);
  const del = picks.find(p => p.req.prompt === 'delete' && p.req.context === 'HATE_3');
  assert.ok(del, JSON.stringify(picks.map(p => p.req.prompt + '/' + p.req.context)));
  assert.deepEqual(del.picks, ['HATE_3']);
  assert.ok(picks.some(p => p.req.context === 'HATE_2'), 'ヘイト①がもう一度起動する');
});

for (const peek of [true, false]) {
  test('ALL-SEEING' + (peek ? '' : ' (手札を見ない)') + ': 相手がヘイト①を撃ち直せる形なら、ファイア③の終了時の反転で表のヘイト①を裏にする', () => {
    Engine.setAiLevel(2);
    Engine.setAiSpecialist(true, 1, 'psylock');
    Engine.setAiPeek(peek ? 1 : -1);
    try {
      const st = board();
      const { state, picks } = drain(Engine.apply(st, { type: 'play', card: uidOf('PSYCHIC_6', 1), line: 0, faceUp: false }), 1);
      const flip = picks.find(p => p.req.context === 'FIRE_4' && p.req.prompt === 'flip');
      assert.ok(flip, JSON.stringify(picks.map(p => p.req.prompt + '/' + p.req.context + '→' + p.picks)));
      assert.deepEqual(flip.picks, ['HATE_2']);
      assert.equal(state.cards[uidOf('HATE_2', 0)].faceUp, false);
      assert.equal(state.cards[uidOf('HATE_1', 0)].faceUp, false, '相手の裏向きのヘイト⓪は表にしない (相手に削除を渡す)');
    } finally {
      Engine.setAiSpecialist(false);
      Engine.setAiPeek(-1);
      Engine.setAiLevel(1);
    }
  });
}

/* 教わった手筋はつよい以上 (探索) と特化だけ。ふつうには入れず、最強・挑戦者 (dsh 特化) には入れる */
test('ヘイト①の撃ち直しを止める評価は、ふつうには入れず、つよい・最強には入れる', () => {
  const threat = () => {
    const st = board();
    const on = Engine.ai.score(st, 1);
    Engine.setAiWeights({ hate1Reuse: 0, hate1ReuseMaybe: 0 });
    Engine.setAiSpecialistWeights && Engine.setAiSpecialistWeights({ hate1Reuse: 0, hate1ReuseMaybe: 0 });
    try { return Engine.ai.score(st, 1) - on; } finally {
      Engine.setAiWeights({ hate1Reuse: 150, hate1ReuseMaybe: 40 });
      Engine.setAiSpecialistWeights && Engine.setAiSpecialistWeights({ hate1Reuse: 150, hate1ReuseMaybe: 40 });
    }
  };
  try {
    Engine.setAiLevel(1);
    assert.equal(threat(), 0, 'ふつう');
    Engine.setAiLevel(2);
    assert.ok(threat() > 0, 'つよい');
    Engine.setAiSpecialist(true, 1, 'dsh');
    assert.ok(threat() > 0, '最強');
  } finally {
    Engine.setAiSpecialist(false);
    Engine.setAiLevel(1);
  }
});

/* 茜の2つ目 HATE/ICE/FEAR (2026-10-19 ユーザー「HATE1を使い回すプレイングを作り込みたい」):
   覆われた表のヘイト①の上を、アイス① (他のカードを移動) やフィア⓪ (移動か反転) でどかして、もう一度起動する */
function coveredBoard(hand) {
  const st = Engine.newGame({ p0: ['HATE', 'ICE', 'FEAR'], p1: ['FIRE', 'WATER', 'COURAGE'], seed: 7, first: 0 }).state;
  place(st, 'HATE_2', 0, 0, true);
  place(st, 'HATE_6', 0, 0, false);
  place(st, 'FIRE_3', 1, 0, true);
  place(st, 'WATER_4', 1, 1, true);
  place(st, 'COURAGE_3', 1, 2, true);
  place(st, 'FIRE_2', 1, 2, false);
  setHand(st, 0, hand);
  st.turn = 0;
  return st;
}
for (const [card, line] of [['ICE_2', 1], ['FEAR_1', 2]]) {
  test('ヘイト①の使い回し: ' + card + ' で覆った札をどかして、ヘイト①をもう一度起動する', () => {
    Engine.setAiLevel(2);
    Engine.setAiSpecialist(true, 0, 'dsh');
    try {
      const st = coveredBoard([card, 'ICE_5', 'FEAR_6', 'ICE_4']);
      const { picks } = drain(Engine.apply(st, { type: 'play', card: uidOf(card, 0), line, faceUp: true }), 0);
      const shift = picks.find(p => p.req.prompt === 'shift');
      assert.ok(shift, JSON.stringify(picks.map(p => p.req.prompt + '/' + p.req.context)));
      assert.deepEqual(shift.picks, ['HATE_6']);
      assert.ok(picks.some(p => p.req.context === 'HATE_2' && p.req.prompt === 'delete'), 'ヘイト①がもう一度起動する');
    } finally {
      Engine.setAiSpecialist(false);
      Engine.setAiLevel(1);
    }
  });
}

test('ヘイト①の使い回し: 手札にアイス①があれば、その手を選ぶ', () => {
  Engine.setAiLevel(2);
  Engine.setAiSpecialist(true, 0, 'dsh');
  try {
    const st = coveredBoard(['ICE_2', 'FEAR_3', 'ICE_5', 'FEAR_6']);
    const a = Engine.ai.action(st);
    assert.equal(st.cards[a.card].def, 'ICE_2');
  } finally {
    Engine.setAiSpecialist(false);
    Engine.setAiLevel(1);
  }
});
