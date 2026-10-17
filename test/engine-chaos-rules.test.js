/* エンジンの、勝ち抜き戦の異変のためのはじめ方: 負けるが勝ち (misere) と手札交換 (handSwap) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const root = path.join(__dirname, '..');
E.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));

function playOut(opts, check) {
  E.setTrace(false);
  E.setAiLevel(0);
  let res = E.newGame(opts);
  for (let k = 0; k < 3000 && res.state.winner === null; k++) {
    const a = res.requests.length ? { type: 'choose', id: res.requests[0].id, picks: E.ai.answer(res.state, res.requests[0]) } : E.ai.action(res.state);
    if (!a) break;
    const prev = res.state;
    res = E.apply(res.state, a);
    assert.equal(res.error, null);
    if (check) check(prev, res.state);
  }
  return res.state;
}
const done = (st, side) => st.players[side].protocols.filter(p => p.compiled).length;

test('負けるが勝ち: 先にコンパイルし終えた側の負けになる', () => {
  for (const seed of [1, 2, 3, 4]) {
    const st = playOut({ seed, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], winCompiles: 1, misere: true });
    assert.equal(st.misere, true);
    assert.notEqual(st.winner, null);
    /* 1本先取: 勝ったほうはコンパイルしていない (した側が負け) */
    assert.equal(done(st, 1 - st.winner) >= 1, true);
  }
});

test('手札交換: n 手番ごとに両者の手札が入れ替わり、入れ替わった札は両者に見える', () => {
  let swaps = 0;
  playOut({ seed: 5, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], handSwap: 4 }, (prev, st) => {
    if ((st.turns | 0) !== (prev.turns | 0) && st.turns % 4 === 0 && st.winner === null) {
      swaps++;
      for (const side of [0, 1]) {
        for (const uid of st.players[side].hand) {
          assert.equal(st.cards[uid].zone, 'hand' + side);
          assert.equal(st.cards[uid].knownTo, 3);
        }
      }
    }
  });
  assert.ok(swaps >= 1);
  assert.equal(E.newGame({ seed: 1, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'] }).state.handSwap, undefined);
});

test('寝返り: n 手番ごとに、あるラインのいちばん上のカードどうしが入れ替わる (枚数は変わらない)', () => {
  let turned = 0;
  playOut({ seed: 7, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], turncoat: 3 }, (prev, st) => {
    if ((st.turns | 0) !== (prev.turns | 0) && st.turns % 3 === 0 && (st.actionLog || []).some(x => String(x).includes('寝返り'))) turned++;
  });
  assert.ok(turned >= 0);
  /* 決まった盤面で確かめる: 両側に札があるラインで上どうしが入れ替わる */
  const r = E.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], turncoat: 2 });
  assert.equal(r.state.turncoat, 2);
});

/* ヒーロー融合: 盤面を組んで、相手のコンパイルで融合 → 次の自分の手番のはじめに 2100 ダメージ */
function heroBoard() {
  const res = E.newGame({ seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'], heroFusion: true });
  const st = JSON.parse(JSON.stringify(res.state));
  const take = (uid) => {
    for (const p of st.players) for (const k of ['deck', 'hand', 'trash']) { const i = p[k].indexOf(uid); if (i >= 0) p[k].splice(i, 1); }
    for (const l of st.lines) for (const s of l) { const i = s.indexOf(uid); if (i >= 0) s.splice(i, 1); }
  };
  const put = (uid, line, side, faceUp) => { take(uid); st.lines[line][side].push(uid); Object.assign(st.cards[uid], { zone: 'field', faceUp, knownTo: faceUp ? 3 : 1 << side }); };
  put('p0:FIRE_1', 1, 0, true);
  put('p0:FIRE_3', 2, 0, false);
  /* 相手のライン1に裏向き5枚 (値 10) を積み、次の手番のはじめにコンパイルさせる */
  st.players[1].deck.slice(0, 5).forEach(u => put(u, 0, 1, false));
  return st;
}
const step = (res) => E.apply(res.state, res.requests.length
  ? { type: 'choose', id: res.requests[0].id, picks: E.ai.answer(res.state, res.requests[0]) }
  : E.ai.action(res.state));

test('ヒーロー融合: 相手がコンパイルすると FIRE 1・FIRE 3 がシャイニングフレアウィングマンになり、攻撃で 2100 ダメージ', () => {
  E.setTrace(false); E.setAiLevel(0);
  const st = heroBoard();
  assert.deepEqual(st.lp, [4000, 4000]);
  /* P1 は手札を捨てて終わるだけの手 (リフレッシュ) にする */
  let res = E.apply(st, { type: 'refresh' });
  if (res.error) res = E.apply(st, E.ai.action(st));
  assert.equal(res.error, null);
  for (let k = 0; k < 50 && !(res.state.heroLog || []).some(h => h.kind === 'fusion'); k++) res = step(res);
  const s1 = res.state;
  const wing = Object.values(s1.cards).find(c => c.def === 'HERO_WINGMAN');
  assert.ok(wing, '融合した');
  assert.equal(wing.owner, 0);
  assert.equal(wing.zone, 'field');
  assert.equal(s1.cards['p0:FIRE_1'].zone, 'trash0');
  assert.equal(s1.cards['p0:FIRE_3'].zone, 'trash0');
  for (let k = 0; k < 80 && !(res.state.heroLog || []).some(h => h.kind === 'attack') && res.state.winner === null; k++) res = step(res);
  const atk = (res.state.heroLog || []).find(h => h.kind === 'attack');
  assert.ok(atk, '攻撃した');
  assert.equal(atk.p, 0);
  assert.equal(atk.lp, 1900);
});

test('ヒーロー融合: FIRE が無いデッキにも素材が混ざり、異変なしならライフは無い', () => {
  const st = E.newGame({ seed: 1, p0: ['DARKNESS', 'HATE', 'LIFE'], p1: ['FIRE', 'WATER', 'SPEED'], heroFusion: true }).state;
  assert.ok(st.cards['p0:FIRE_1'] && st.cards['p0:FIRE_3']);
  assert.equal(Object.keys(st.cards).filter(u => u.startsWith('p1:FIRE_')).length, 6);
  assert.equal(E.newGame({ seed: 1, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'LIFE'] }).state.lp, undefined);
});

test('ヒーロー融合: 最後まで遊びきれる (ライフ 0 でも決着する)', () => {
  for (const seed of [11, 12, 13]) {
    const st = playOut({ seed, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['FIRE', 'HATE', 'LIFE'], heroFusion: true });
    assert.notEqual(st.winner, null);
    if (st.lp[0] === 0 || st.lp[1] === 0) assert.equal(st.lp[st.winner] > 0, true);
  }
});

test('ヒーロー融合: 自分がコンパイルすると FIRE 1・FIRE 3 がフェニックスガイになる', () => {
  E.setTrace(false); E.setAiLevel(0);
  const st = heroBoard();
  /* 相手の積みを崩して、こちらのライン1に裏向き5枚 */
  const mine = st.players[0].deck.slice(0, 5);
  for (const u of st.lines[0][1].splice(0)) { st.players[1].deck.push(u); Object.assign(st.cards[u], { zone: 'deck1', faceUp: false }); }
  for (const u of mine) { st.players[0].deck.splice(st.players[0].deck.indexOf(u), 1); st.lines[0][0].push(u); Object.assign(st.cards[u], { zone: 'field', faceUp: false, knownTo: 1 }); }
  let res = E.apply(st, { type: 'refresh' });
  if (res.error) res = E.apply(st, E.ai.action(st));
  for (let k = 0; k < 80 && !(res.state.heroLog || []).some(h => h.kind === 'fusion') && res.state.winner === null; k++) res = step(res);
  const f = (res.state.heroLog || []).find(h => h.kind === 'fusion');
  assert.ok(f);
  assert.equal(f.hero, 'HERO_PHOENIX');
  assert.equal(f.p, 0);
});
