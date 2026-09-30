import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const R = await import('../js3d/resume.js');

const meta = { mode: 'cpu', level: 2, me: ['FIRE', 'LIFE', 'PSYCHIC'], opp: ['DARKNESS', 'SPEED', 'HATE'] };
const init = { seed: 7, p0: meta.me, p1: meta.opp, first: 0, winCompiles: null };

test('対戦を始めて手を記録すると、読み出せる。決着したら消える', () => {
  R.startResume(meta, init, 1000);
  R.logResume({ type: 'play', card: 'p0:FIRE_1', line: 0, faceUp: true });
  R.logResume({ type: 'refresh' });
  const r = R.loadResume(2000);
  assert.equal(r.meta.mode, 'cpu');
  assert.deepEqual(r.init, init);
  assert.equal(r.actions.length, 2);
  R.endResume();
  assert.equal(R.loadResume(2000), null);
});

test('取り消し (UNDO) で手の数を戻せる', () => {
  R.startResume(meta, init, 1000);
  for (let i = 0; i < 5; i++) R.logResume({ type: 'refresh', i });
  R.truncateResume(3);
  assert.equal(R.loadResume(2000).actions.length, 3);
});

test('古すぎる (1日より前)・壊れた・手が1つも無い記録は再開しない', () => {
  R.startResume(meta, init, 1000);
  R.logResume({ type: 'refresh' });
  assert.equal(R.loadResume(1000 + 25 * 3600 * 1000), null, '1日より前');
  R.startResume(meta, init, 1000);
  assert.equal(R.loadResume(2000), null, '手が無いなら始め直しと同じ');
  localStorage.setItem(R.RESUME_KEY, '{broken');
  assert.equal(R.loadResume(2000), null);
});

test('記録していない (始めていない) ときの記録・取り消しは何もしない', () => {
  R.endResume();
  R.logResume({ type: 'refresh' });
  R.truncateResume(0);
  assert.equal(R.loadResume(2000), null);
});

test('説明の文: 相手のデッキと手の数', () => {
  R.startResume(meta, init, 1000);
  R.logResume({ type: 'refresh' });
  const label = R.resumeLabel(R.loadResume(2000));
  assert.match(label, /DARKNESS \/ SPEED \/ HATE/);
  assert.match(label, /1手/);
});
