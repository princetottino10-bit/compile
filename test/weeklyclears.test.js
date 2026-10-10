import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

test('週替わりのクリア数は、帳簿の古い分が短い形に詰められても数える (LAUREL に鍵がかからない)', async () => {
  const { weeklyClears } = await import('../js3d/rewards.js');
  /* 古い分は [id, src, xp, at] の形、新しい分はそのまま */
  store.set('compileXpLog', JSON.stringify([['k:wk:W2950', 'weekly', 20, 1], ['k:wk:W2951', 'weekly', 20, 2],
    { id: 'k:wk:W2952', src: 'weekly', xp: 20, at: 3, key: 'wk:W2952' }, { id: 'k:wkb:W2952', src: 'weekly', xp: 10, at: 4 }]));
  assert.equal(weeklyClears(), 3);
});
