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
