import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Engine = require('../engine.js');
Engine.init(JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/effects.json', import.meta.url), 'utf8')));

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const R = await import('../js3d/replays.js');

/* 手を適当に選んで数十手進め、その棋譜を返す (乱数は固定) */
function playSome(init, steps) {
  let res = Engine.newGame({ ...init });
  const actions = [];
  let n = 7;
  const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < steps && res.winner === null; i++) {
    let a;
    if (res.requests.length) {
      const q = res.requests[0];
      a = { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) };
    } else {
      const acts = Engine.legalActions(res.state);
      if (!acts.length) break;
      a = acts[Math.floor(rnd() * acts.length)];
    }
    const next = Engine.apply(res.state, a);
    if (next.error) continue;
    actions.push(JSON.parse(JSON.stringify(a)));
    res = next;
  }
  return { actions, final: res.state };
}

test('棋譜から同じ盤面を作り直せる', () => {
  const init = { seed: 4242, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'LIFE', 'LIGHT'], first: 1, winCompiles: null };
  const { actions, final } = playSome(init, 60);
  assert.ok(actions.length > 20);
  const r = R.rebuild(Engine, { init, actions });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.final), JSON.stringify(final));
  assert.ok(r.history.length > 0);
  assert.ok(r.history.every(h => h.action.type === 'play' || h.action.type === 'refresh'));
});

test('当てはまらない手が来たらそこで止める', () => {
  const init = { seed: 1, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'LIFE', 'LIGHT'], first: 0 };
  const { actions } = playSome(init, 10);
  const r = R.rebuild(Engine, { init, actions: actions.concat({ type: 'play', card: 'nope', line: 9, faceUp: true }) });
  assert.equal(r.ok, false);
});

const rep = (i) => ({ me: ['FIRE', 'WATER', 'SPEED'], opp: ['DEATH', 'LIFE', 'LIGHT'], win: i % 2 === 0, level: 1, turns: 40,
  init: { seed: i, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DEATH', 'LIFE', 'LIGHT'], first: 0 }, actions: [] });

test('自動で残すのは直近の RECENT 戦、保存したものは別に残る', () => {
  mem.clear();
  const first = R.addReplay(rep(0), 1000);
  assert.ok(R.pinReplay(first, true).ok);
  for (let i = 1; i <= R.RECENT + 5; i++) R.addReplay(rep(i), 1000 + i);
  const list = R.listReplays();
  assert.equal(list.filter(r => !r.pinned).length, R.RECENT);
  assert.ok(list.find(r => r.id === first && r.pinned));
});

test('保存は PINNED 戦まで', () => {
  mem.clear();
  const ids = [];
  for (let i = 0; i < R.PINNED + 1; i++) ids.push(R.addReplay(rep(i), 5000 + i));
  let ok = 0;
  for (const id of ids) {
    if (R.getReplay(id) && R.pinReplay(id, true).ok) ok++;
  }
  assert.ok(ok <= R.PINNED);
});

test('アカウントから取り込むと保存済みになる。同じ id は足さない', () => {
  mem.clear();
  const id = R.addReplay(rep(1), 100);
  const added = R.mergeReplays([{ ...rep(2), id: 'rremote1', at: 50 }, { ...rep(1), id, at: 100 }, { id: 'bad' }]);
  assert.equal(added, 1);
  assert.equal(R.getReplay('rremote1').pinned, true);
});

test('保存・外す・消すをアカウントへ知らせる', () => {
  mem.clear();
  const seen = [];
  R.setReplayHooks({ onPin: (r) => seen.push('pin:' + r.id), onUnpin: (id) => seen.push('unpin:' + id) });
  const id = R.addReplay(rep(1), 100);
  R.pinReplay(id, true);
  R.deleteReplay(id);
  R.setReplayHooks({ onPin: null, onUnpin: null });
  assert.deepEqual(seen, ['pin:' + id, 'unpin:' + id]);
});

test('盤面の左右の入れ替え: 2回で元どおり、側の値が入れ替わる (オンラインの後攻の棋譜)', () => {
  const init = { seed: 4242, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['HATE', 'WAR', 'PSYCHIC'], first: 1 };
  const rep = { init, actions: playSome(init, 60).actions };
  const built = R.rebuild(Engine, rep);
  const st = built.history[built.history.length - 1].st;
  assert.deepEqual(R.mirrorState(R.mirrorState(st)), st);
  const m = R.mirrorState(st);
  assert.equal(m.turn, 1 - st.turn);
  assert.deepEqual(m.players[0].protocols, st.players[1].protocols);
  for (let l = 0; l < 3; l++) assert.equal(Engine.lineTotal(m, l, 0), Engine.lineTotal(st, l, 1));
  for (const [uid, c] of Object.entries(m.cards)) {
    assert.equal(c.owner, 1 - st.cards[uid].owner);
    if (/^hand/.test(c.zone)) assert.ok(m.players[+c.zone.slice(-1)].hand.includes(uid), uid + ' は入れ替えた側の手札にある');
  }
  /* 左右を入れ替えた棋譜: 手前 (0) が後攻の部屋の人。手の側も入れ替わる */
  const flipped = R.rebuild(Engine, { ...rep, view: 1 });
  assert.equal(flipped.history.length, built.history.length);
  assert.equal(flipped.history[0].st.turn, 1 - built.history[0].st.turn);
  assert.equal(flipped.final.winner === null ? null : flipped.final.winner, built.final.winner === null ? null : 1 - built.final.winner);
});

test('自動で残す枠はオンライン・観戦・それ以外で別 (CPU 戦を続けてもオンラインが押し出されない)', () => {
  mem.clear();
  const online = R.addReplay({ ...rep(0), kind: 'online' }, 10);
  const watch = R.addReplay({ ...rep(0), kind: 'watch' }, 11);
  for (let i = 1; i <= R.RECENT + 5; i++) R.addReplay(rep(i), 100 + i);
  const list = R.listReplays();
  assert.ok(list.find(r => r.id === online), 'オンラインは残る');
  assert.ok(list.find(r => r.id === watch), '観戦は残る');
  assert.equal(list.filter(r => R.poolOf(r) === 'local').length, R.RECENT);
  for (let i = 1; i <= R.RECENT + 2; i++) R.addReplay({ ...rep(i), kind: 'online' }, 500 + i);
  assert.equal(R.listReplays().filter(r => r.kind === 'online').length, R.RECENT);
  assert.equal(R.getReplay(online), null, 'オンラインの枠の中では古いものから押し出す');
});

test('絞り込み・名前・印', () => {
  mem.clear();
  const a = R.addReplay({ ...rep(0), kind: 'online', score: [3, 2], turns: 40 }, 10);
  const b = R.addReplay({ ...rep(1), kind: 'run', turns: 20 }, 11);
  R.addReplay({ ...rep(2), kind: null }, 12);
  const all = R.listReplays();
  assert.equal(R.filterReplays(all, { kind: 'online', result: 'all' }).length, 1);
  assert.equal(R.filterReplays(all, { kind: 'cpu', result: 'all' }).length, 1);
  assert.equal(R.filterReplays(all, { kind: 'all', result: 'win' }).length, 2);
  assert.equal(R.filterReplays(all, { kind: 'run', result: 'lose' }).length, 1);
  assert.ok(R.setReplayTitle(a, '  初めての<レート戦>\u0007 '));
  assert.equal(R.getReplay(a).title, '初めての<レート戦>');
  assert.ok(R.setReplayTitle(a, ''));
  assert.equal('title' in R.getReplay(a), false);
  assert.deepEqual(R.replayTags(R.getReplay(a)), ['接戦', '長期戦']);
  assert.deepEqual(R.replayTags(R.getReplay(b)), []);
  assert.ok(R.noteReplayFacts(b, { comeback: true }));
  assert.deepEqual(R.replayTags(R.getReplay(b)), ['大逆転']);
  assert.equal(R.isComeback([0, -0.6, 0.2, 1], true), true);
  assert.equal(R.isComeback([0, -0.3, 0.2, 1], true), false);
  assert.equal(R.isComeback([0, 0.7, -1], false), true);
});

test('レート戦の記録に合うリプレイを探す (相手・プロトコル・時刻)', () => {
  const end = Date.parse('2026-10-01T12:00:00Z');
  const r = { id: 'r1', kind: 'online', me: ['FIRE', 'WATER', 'SPEED'], opp: ['DEATH', 'LIFE', 'LIGHT'], oppName: 'あお', at: end + 30_000 };
  const m = { endedAt: '2026-10-01T12:00:00Z', opponent: 'あお', myProtocols: ['SPEED', 'FIRE', 'WATER'], opponentProtocols: ['LIGHT', 'DEATH', 'LIFE'] };
  assert.equal(R.findMatchReplay([r], m), r);
  assert.equal(R.findMatchReplay([{ ...r, at: end + 3600_000 }], m), null);
  assert.equal(R.findMatchReplay([{ ...r, oppName: 'ほか' }], m), null);
  assert.equal(R.findMatchReplay([{ ...r, kind: null }], m), null);
});
