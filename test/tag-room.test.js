/* オンラインのタッグ戦 (supabase/functions/_shared/tag.js): 席の決め方・プロトコル選び・手番の人・CPU の席 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const effects = JSON.parse(fs.readFileSync(new URL('../data/effects.json', import.meta.url), 'utf8'));
Engine.init(cards, effects);
const T = await import('../supabase/functions/_shared/tag.js');
const ALL = cards.protocols.map(p => p.name);

const host = { uid: 'u-host', name: 'ホスト' };
const guest = { uid: 'u-guest', name: 'ゲスト' };
const third = { uid: 'u-3', name: '3人目' };

test('席: A1・B1・A2・B2 の順。席の番号から側 (チーム) と何人目かが決まる', () => {
  assert.deepEqual([0, 1, 2, 3].map(T.seatSide), [0, 1, 0, 1]);
  assert.deepEqual([0, 1, 2, 3].map(T.seatPilot), [0, 0, 1, 1]);
  assert.equal(T.seatIndex(1, 1), 3);
});

test('部屋を作るとホストは A1。入る人は人数の少ないチームの空き席に座る', () => {
  const s0 = T.blankSeats(host);
  assert.equal(s0[0].uid, 'u-host');
  assert.deepEqual(s0.slice(1), [null, null, null]);
  const s1 = T.joinSeat(s0, guest);
  assert.notEqual(s1, s0, '元の席は変えない');
  assert.equal(T.seatOf(s1, 'u-guest'), 1, 'チーム B へ');
  const s2 = T.joinSeat(s1, third);
  assert.equal(T.seatOf(s2, 'u-3'), 2);
  assert.equal(T.joinSeat(s2, guest), s2, 'もう座っている人はそのまま');
  const full = T.joinSeat(T.joinSeat(s2, { uid: 'u-4', name: '4' }), { uid: 'u-5', name: '5' });
  assert.equal(T.seatOf(full, 'u-5'), -1, '満席なら座れない');
});

test('席を移る: 空いている席だけ。CPU の席にも移れる (CPU は外れる)', () => {
  let s = T.joinSeat(T.blankSeats(host), guest);          // A1 ホスト / B1 ゲスト
  s = T.moveSeat(s, 'u-guest', 2);                         // ゲストが A2 へ (協力)
  assert.equal(T.seatOf(s, 'u-guest'), 2);
  assert.equal(s[1], null);
  assert.equal(T.moveSeat(s, 'u-guest', 0), s, '人の座っている席には移れない');
  s = T.setCpu(s, 1, true);
  assert.equal(s[1].cpu, true);
  s = T.moveSeat(s, 'u-guest', 1);
  assert.equal(T.seatOf(s, 'u-guest'), 1);
  assert.equal(s[2], null, '元の席は空く');
});

test('CPU の席: 空き ⇔ CPU を切り替える。人の席は変えない', () => {
  let s = T.joinSeat(T.blankSeats(host), guest);
  assert.equal(T.setCpu(s, 1, true), s, '人のいる席は CPU にできない');
  s = T.setCpu(s, 2, true);
  assert.equal(s[2].cpu, true);
  s = T.setCpu(s, 2, false);
  assert.equal(s[2], null);
});

test('よく使う形: 協力 (人 2 vs CPU 2)・対決 (人 1 + CPU 1 ずつ)', () => {
  const s = T.joinSeat(T.blankSeats(host), guest);
  const coop = T.preset(s, 'coop');
  assert.deepEqual([0, 2].map(i => !!(coop[i] && coop[i].uid)), [true, true], 'チーム A に人が2人');
  assert.deepEqual([1, 3].map(i => coop[i].cpu), [true, true]);
  const duel = T.preset(s, 'duel');
  assert.equal(T.seatSide(T.seatOf(duel, 'u-host')), 0);
  assert.equal(T.seatSide(T.seatOf(duel, 'u-guest')), 1, '人は別のチーム');
  assert.equal(duel.filter(x => x && x.cpu).length, 2);
});

test('ランダムに分ける: 人はどこかの席に。CPU の数はそのまま', () => {
  let s = T.setCpu(T.joinSeat(T.blankSeats(host), guest), 2, true);
  for (let k = 0; k < 20; k++) {
    const r = T.preset(s, 'shuffle');
    assert.ok(T.seatOf(r, 'u-host') >= 0 && T.seatOf(r, 'u-guest') >= 0);
    assert.equal(r.filter(x => x && x.cpu).length, 1);
    assert.equal(r.filter(x => x === null).length, 1);
  }
});

test('始められるか: 4席が埋まり、人が2人以上', () => {
  const s = T.joinSeat(T.blankSeats(host), guest);
  assert.equal(T.canStart(s), false);
  assert.equal(T.canStart(T.preset(s, 'coop')), true);
  assert.equal(T.canStart(T.preset(T.blankSeats(host), 'coop')), false, '人が1人だけ');
});

test('プロトコル: 3つ・重なりなし・味方と重ならない。CPU は残りから選ぶ', () => {
  let s = T.preset(T.joinSeat(T.blankSeats(host), guest), 'coop');     // A1 ホスト, A2 ゲスト
  s = T.pickProtocols(s, 'u-host', ['FIRE', 'WATER', 'LIFE'], ALL);
  assert.deepEqual(s[0].protocols, ['FIRE', 'WATER', 'LIFE']);
  assert.throws(() => T.pickProtocols(s, 'u-guest', ['FIRE', 'SPEED', 'DEATH'], ALL), /味方/);
  assert.throws(() => T.pickProtocols(s, 'u-guest', ['SPEED', 'SPEED', 'DEATH'], ALL));
  assert.throws(() => T.pickProtocols(s, 'u-guest', ['NOPE', 'SPEED', 'DEATH'], ALL));
  s = T.pickProtocols(s, 'u-guest', ['SPEED', 'DEATH', 'HATE'], ALL);
  assert.equal(T.allPicked(s), false, 'CPU がまだ');
  let k = 0;
  s = T.fillCpuProtocols(s, ALL, () => ((k = (k * 9301 + 49297) % 233280) / 233280));
  assert.equal(T.allPicked(s), true);
  for (const team of [[0, 2], [1, 3]]) {
    const names = team.flatMap(i => s[i].protocols);
    assert.equal(new Set(names).size, 6, 'チームの中で重ならない');
  }
});

/* 全員が選び終えた席から、実際にタッグの対戦を作る */
function readyGame() {
  let s = T.preset(T.joinSeat(T.blankSeats(host), guest), 'coop');
  s = T.pickProtocols(s, 'u-host', ['FIRE', 'WATER', 'LIFE'], ALL);
  s = T.pickProtocols(s, 'u-guest', ['SPEED', 'DEATH', 'HATE'], ALL);
  s = T.fillCpuProtocols(s, ALL, Math.random);
  const res = Engine.newGame({ ...T.gameOpts(s), seed: 11, first: 0, useControl: true });
  return { s, res };
}

test('対戦を作る: A1 と B1 が場のプロトコル、A2 と B2 は相棒 (tag)', () => {
  const { s, res } = readyGame();
  assert.ok(!res.error, res.error);
  assert.ok(res.state.tag);
  assert.deepEqual(res.state.players[0].protocols.map(p => p.names), [0, 1, 2].map(i => [s[0].protocols[i], s[2].protocols[i]]));
  assert.equal(T.activeSeat(res.state), 0, 'はじめは A1 の番');
});

test('手番の人だけが指せる。見える手札は自分の分 (相棒の番のあいだは控えの手札)', () => {
  const { res } = readyGame();
  const st = res.state;
  assert.equal(T.mayAct(st, 0), true);
  assert.equal(T.mayAct(st, 2), false, '同じチームでも相棒は指せない');
  assert.equal(T.mayAct(st, 1), false);
  const mine = T.viewerHand(st, 0), mate = T.viewerHand(st, 2);
  assert.deepEqual(mine, st.players[0].hand);
  assert.deepEqual(mate, st.tag.bench[0].hand);
  assert.equal(T.viewerCounts(st, 2).hand, st.tag.bench[0].hand.length);
});

test('CPU の席の番は、サーバーが続けて指す (人の番か決着で止まる)', () => {
  const { s, res } = readyGame();
  /* A1 (人) が1手指して、B1 (CPU) の番へ */
  const act = Engine.legalActions(res.state).find(a => a.type === 'play');
  let r = Engine.apply(res.state, act);
  while (r.requests && r.requests[0] && T.seatOfRequest(r.state, r.requests[0]) === 0) {
    r = Engine.apply(r.state, { type: 'choose', id: r.requests[0].id, picks: Engine.ai.answer(r.state, r.requests[0]) });
  }
  const out = T.runCpu(Engine, r, s, 60);
  assert.ok(out.steps > 0, 'CPU が指した');
  const who = out.res.state.winner === null ? T.activeSeatOf(out.res) : null;
  assert.ok(who === null || !s[who].cpu, '止まったのは人の番 (か決着)');
});
