'use strict';
/* CPU の記憶: 一度公開されて行き先を目で追えるカード (表で手札に戻された札・裏返された札・公開された手札) を、
   画面の見え方 (knownTo) は変えずに CPU の読みでだけ覚えておく (seenBy)。
   どれが動いたか見えない動き (手札から裏で出す) やシャッフルで忘れる */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
Engine.init(read('cards.json'), read('effects.json'));

const uidOf = (d, side) => 'p' + side + ':' + d;
const rm = (a, x) => { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); };
function place(st, d, side, line, faceUp) {
  const u = uidOf(d, side), p = st.players[side];
  rm(p.deck, u); rm(p.hand, u); rm(p.trash, u);
  st.lines[line][side].push(u);
  Object.assign(st.cards[u], { zone: 'field', faceUp: !!faceUp, knownTo: faceUp ? 3 : 1 << side });
  return u;
}
function setHand(st, side, ids) {
  const p = st.players[side];
  while (p.hand.length) { const u = p.hand.pop(); Object.assign(st.cards[u], { zone: 'deck' + side, knownTo: 0 }); p.deck.push(u); }
  for (const d of ids) { const u = uidOf(d, side); rm(p.deck, u); Object.assign(st.cards[u], { zone: 'hand' + side, knownTo: 1 << side }); p.hand.push(u); }
}
function drive(res, answer) {
  for (let n = 0; res.requests.length; n++) {
    assert.ok(n < 30, '選択要求が収束しない');
    const req = res.requests[0];
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: (answer && answer(req, res.state)) || Engine.ai.answer(res.state, req) });
    assert.equal(res.error, null);
  }
  return res;
}
/* CPU (side) が読みで想像する世界を salt 違いで並べ、uid の中身がいつも本物と同じか */
function alwaysKnown(st, side, uid) {
  for (let k = 1; k <= 40; k++) if (Engine.ai.informationState(st, side, k).cards[uid].def !== st.cards[uid].def) return false;
  return true;
}
function setup() {
  const st = Engine.newGame({ p0: ['FEAR', 'APATHY', 'WATER'], p1: ['HATE', 'METAL', 'SPEED'], seed: 7 }).state;
  st.turn = 0; st.phase = 'action';
  return st;
}
/* FEAR 3 で相手の表の HATE 1 を手札に戻した局面 */
function returnedHate1() {
  const st = setup();
  place(st, 'HATE_1', 1, 0, true);
  setHand(st, 0, ['FEAR_3']);
  const res = drive(Engine.apply(st, { type: 'play', card: uidOf('FEAR_3', 0), line: 0, faceUp: true }));
  assert.equal(res.state.cards[uidOf('HATE_1', 1)].zone, 'hand1');
  return res.state;
}

test('AI memory: a face-up card returned to the opponent hand stays known to the CPU, not to the screen', () => {
  const st = returnedHate1();
  const h1 = uidOf('HATE_1', 1);
  assert.equal(st.cards[h1].knownTo & 1, 0, '画面では相手の手札は伏せたまま');
  assert.ok(alwaysKnown(st, 0, h1), 'CPU の想像する世界ではいつも HATE 1 が相手の手札にある');
});

test('AI memory: cards already seen are subtracted from the imagined opponent hand and deck', () => {
  const st = returnedHate1();
  const seen = new Set();
  for (let l = 0; l < 3; l++) for (const u of st.lines[l][1]) if (st.cards[u].faceUp) seen.add(st.cards[u].def);
  for (const u of st.players[1].trash) seen.add(st.cards[u].def);
  for (let k = 1; k <= 20; k++) {
    const v = Engine.ai.informationState(st, 0, k);
    for (const u of v.players[1].hand.concat(v.players[1].deck)) {
      if (u === uidOf('HATE_1', 1)) continue;
      assert.ok(!seen.has(v.cards[u].def), v.cards[u].def + ' は場か捨て札で見えているので手札・山札には想像しない');
    }
  }
});

test('AI memory: a facedown play from that hand blurs the memory whichever card was played', () => {
  const h1 = uidOf('HATE_1', 1);
  for (const played of ['HATE_1', 'METAL_1']) {
    const st = returnedHate1();
    /* 相手の手札を HATE 1 と METAL 0 の2枚に (HATE 1 の記憶はそのまま) */
    const p = st.players[1];
    for (const u of p.hand.slice()) if (u !== h1) { rm(p.hand, u); st.cards[u].zone = 'deck1'; p.deck.push(u); }
    const m0 = uidOf('METAL_1', 1);
    rm(p.deck, m0); Object.assign(st.cards[m0], { zone: 'hand1', knownTo: 2 }); p.hand.push(m0);
    st.turn = 1; st.phase = 'action'; st.pending = null;
    const res = drive(Engine.apply(st, { type: 'play', card: uidOf(played, 1), line: 1, faceUp: false }));
    const s = res.state;
    /* どちらを出しても、CPU が覚えている札は同じ (= uid からどれを出したかが漏れない) */
    assert.equal(alwaysKnown(s, 0, h1), false, played + ' を出したあと HATE 1 の行方は分からない');
    assert.equal(alwaysKnown(s, 0, m0), false);
  }
});

test('AI memory: with a single remembered card in hand, its facedown play is still tracked', () => {
  const st = returnedHate1();
  const h1 = uidOf('HATE_1', 1);
  setHand(st, 1, []);
  const p = st.players[1];
  Object.assign(st.cards[h1], { zone: 'hand1', seenBy: 3, knownTo: 2 }); rm(p.deck, h1); p.hand.push(h1);
  st.turn = 1; st.phase = 'action'; st.pending = null;
  const res = drive(Engine.apply(st, { type: 'play', card: h1, line: 1, faceUp: false }));
  assert.equal(res.state.cards[h1].zone, 'field');
  assert.equal(res.state.cards[h1].knownTo & 1, 0, '画面では裏のまま');
  assert.ok(alwaysKnown(res.state, 0, h1), '手札が1枚なら、裏で出た札が何かは分かる');
});

test('AI memory: a face-up card flipped facedown keeps its identity for both players', () => {
  const st = setup();
  const h1 = place(st, 'HATE_1', 1, 0, true);
  setHand(st, 0, ['APATHY_4']);
  const res = drive(Engine.apply(st, { type: 'play', card: uidOf('APATHY_4', 0), line: 1, faceUp: true }));
  assert.equal(res.state.cards[h1].faceUp, false);
  assert.equal(res.state.cards[h1].knownTo & 1, 0);
  assert.ok(alwaysKnown(res.state, 0, h1), '裏返したのを見ていたので正体は分かる');
});

test('AI memory: a revealed opponent hand is remembered after the overlay', () => {
  const st = Engine.newGame({ p0: ['LIGHT', 'APATHY', 'WATER'], p1: ['HATE', 'METAL', 'SPEED'], seed: 7 }).state;
  st.turn = 0; st.phase = 'action';
  setHand(st, 0, ['LIGHT_5']);
  const res = drive(Engine.apply(st, { type: 'play', card: uidOf('LIGHT_5', 0), line: 0, faceUp: true }));
  assert.ok(res.state.players[1].hand.length > 0);
  for (const u of res.state.players[1].hand) {
    assert.equal(res.state.cards[u].knownTo & 1, 0);
    assert.ok(alwaysKnown(res.state, 0, u));
  }
});

test('AI memory: a shuffle wipes what was remembered in the deck', () => {
  /* 先手の山の一番上を後手が覚えている状態から、CLARITY 5 で捨て札ごとシャッフルする */
  const st = Engine.newGame({ p0: ['CLARITY', 'APATHY', 'WATER'], p1: ['HATE', 'METAL', 'SPEED'], seed: 7 }).state;
  st.turn = 0; st.phase = 'action';
  setHand(st, 0, ['CLARITY_5']);
  const p = st.players[0];
  const trashed = p.deck.pop();
  Object.assign(st.cards[trashed], { zone: 'trash0', faceUp: true, knownTo: 3 }); p.trash.push(trashed);
  const top = p.deck[0];
  st.cards[top].seenBy = 3;
  assert.ok(alwaysKnown(st, 1, top));
  const res = drive(Engine.apply(st, { type: 'play', card: uidOf('CLARITY_5', 0), line: 0, faceUp: true }),
    req => (req.kind === 'yesNo' ? [0] : null));
  assert.equal(res.state.players[0].trash.length, 0, 'シャッフルした');
  assert.equal(alwaysKnown(res.state, 1, top), false);
  assert.equal(alwaysKnown(res.state, 1, trashed), false);
});
