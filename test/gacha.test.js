'use strict';
/* COSMETICS のガチャ (gacha.js): CHIP・レア度・天井・10連の確定・かぶり・図鑑・見た目の解放 */
const { test } = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = () => import('../js3d/gacha.js');
const empty = { spent: 0, owned: {}, pulls: 0, pity: 0 };

test('CHIP が足りなければ引けない。1回 10・10連 90', async () => {
  const G = await load();
  assert.equal(G.pull(empty, 9, 1), null);
  const one = G.pull(empty, 10, 1, () => 0.9);
  assert.equal(one.results.length, 1);
  assert.equal(G.chipsOf(one.state, 10), 0);
  assert.equal(G.pull(empty, 89, 10), null);
  assert.equal(G.pull(empty, 90, 10, () => 0.9).results.length, 10);
});

test('レア度: 小さい乱数ほどレア。10連は RARE 以上が1つは出る。EPIC 以上が9回出なければ10回目は確定', async () => {
  const G = await load();
  assert.equal(G.pull(empty, 10, 1, () => 0.01).results[0].rar, 'L');
  assert.equal(G.pull(empty, 10, 1, () => 0.9).results[0].rar, 'C');
  const ten = G.pull(empty, 90, 10, () => 0.9);
  assert.ok(ten.results.slice(0, 9).every(r => r.rar === 'C'));
  assert.ok(['R', 'E', 'L'].includes(ten.results[9].rar), '10連の最後は RARE 以上');
  const pity = G.pull({ ...empty, pity: 9 }, 10, 1, () => 0.9);
  assert.ok(['E', 'L'].includes(pity.results[0].rar), '天井');
  assert.equal(pity.state.pity, 0);
  assert.equal(Object.values(G.RATES).reduce((a, b) => a + b, 0), 100);
});

test('かぶったら CHIP を少し返す。図鑑に数える', async () => {
  const G = await load();
  const a = G.pull(empty, 10, 1, () => 0.9);
  const id = a.results[0].kind + ':' + a.results[0].key;
  assert.ok(a.state.owned[id]);
  const b = G.pull(a.state, 20, 1, () => 0.9);
  assert.equal(b.results[0].dupe, true);
  assert.equal(G.chipsOf(b.state, 20), G.REFUND.C);
  assert.equal(G.collection(b.state).got, 1);
});

test('ガチャの見た目は、取るまで COSMETICS に出ない。取ったら出る (称号も)', async () => {
  const R = await import('../js3d/rewards.js');
  store.delete('compileGacha');
  assert.equal(R.isUnlocked('sleeve', 'galaxy', 99), false);
  assert.ok(!R.ownedTitles(99, []).includes('fortune'));
  store.set('compileGacha', JSON.stringify({ spent: 0, owned: { 'sleeve:galaxy': 1, 'title:fortune': 1 }, pulls: 1, pity: 0 }));
  assert.equal(R.isUnlocked('sleeve', 'galaxy', 1), true);
  assert.ok(R.ownedTitles(1, []).includes('fortune'));
  for (const g of R.GACHA_ITEMS) {
    if (g.kind === 'title') assert.ok(R.TITLES[g.key], g.key);
    else assert.ok(R.COSMETICS[g.kind].some(([k]) => k === g.key), g.kind + ':' + g.key + ' は COSMETICS にある');
    assert.ok(!R.REWARDS.some(r => r.kind === g.kind && r.key === g.key), 'レベルの報酬と重ならない');
  }
  store.delete('compileGacha');
});

test('アカウントの保存を合わせる: 取ったものは両方、使った CHIP は多い方', async () => {
  const G = await load();
  const m = JSON.parse(G.mergeGacha(JSON.stringify({ spent: 30, owned: { a: 5 }, pulls: 3, pity: 2 }), JSON.stringify({ spent: 50, owned: { b: 7, a: 3 }, pulls: 5, pity: 1 })));
  assert.deepEqual(m.owned, { a: 3, b: 7 });
  assert.equal(m.spent, 50);
  assert.equal(m.pulls, 5);
});
