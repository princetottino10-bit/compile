import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

test('アカウントから読んだ戦績で、手元の戦績の抜けている種類 (mode)・短縮マッチの印 (short) を埋める', async () => {
  const { mergeRecords, localRecords } = await import('../js3d/stats.js');
  const rec = (id, o) => ({ id, me: ['FIRE', 'WATER', 'LIFE'], opp: ['DEATH', 'METAL', 'LIGHT'], win: true, level: 3, at: Number(id.slice(1)), ...o });
  store.set('compileSoloRecords', JSON.stringify([rec('r1'), rec('r2', { mode: 'cpu' })]));
  const added = mergeRecords([rec('r1', { mode: 'run', short: true }), rec('r2', { mode: 'weekly' }), rec('r3', { mode: 'tag' })]);
  assert.equal(added, 1, '新しく足したのは r3 だけ');
  const byId = Object.fromEntries(localRecords().map(r => [r.id, r]));
  assert.equal(byId.r1.mode, 'run');
  assert.equal(byId.r1.short, true);
  assert.equal(byId.r2.mode, 'cpu', '手元に種類があるものは上書きしない');
  assert.equal(byId.r3.mode, 'tag');
});
