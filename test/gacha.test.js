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

test('CHIP が足りなければ引けない。1回 15・10連 135', async () => {
  const G = await load();
  const P = G.PULL_COST, T = G.TEN_COST;
  assert.equal(P, 15); assert.equal(T, 135);
  assert.equal(G.pull(empty, P - 1, 1), null);
  const one = G.pull(empty, P, 1, () => 0.9);
  assert.equal(one.results.length, 1);
  assert.equal(G.chipsOf(one.state, P), 0);
  assert.equal(G.pull(empty, T - 1, 10), null);
  assert.equal(G.pull(empty, T, 10, () => 0.9).results.length, 10);
});

test('レア度: 小さい乱数ほどレア。10連は RARE 以上が1つは出る。EPIC 以上が9回出なければ10回目は確定', async () => {
  const G = await load();
  const P = G.PULL_COST;
  assert.equal(G.pull(empty, P, 1, () => 0.01).results[0].rar, 'L');
  assert.equal(G.pull(empty, P, 1, () => 0.9).results[0].rar, 'C');
  const ten = G.pull(empty, G.TEN_COST, 10, () => 0.9);
  assert.ok(ten.results.slice(0, 9).every(r => r.rar === 'C'));
  assert.ok(['R', 'E', 'L'].includes(ten.results[9].rar), '10連の最後は RARE 以上');
  const pity = G.pull({ ...empty, pity: 9 }, P, 1, () => 0.9);
  assert.ok(['E', 'L'].includes(pity.results[0].rar), '天井');
  assert.equal(pity.state.pity, 0);
  assert.equal(Object.values(G.RATES).reduce((a, b) => a + b, 0), 100);
});

test('まだ持っていない物から出す。同じレア度を全部持っていたら、かぶって CHIP を少し返す', async () => {
  const G = await load();
  const R = await import('../js3d/rewards.js');
  const P = G.PULL_COST;
  const a = G.pull(empty, P, 1, () => 0.9);
  const id = a.results[0].kind + ':' + a.results[0].key;
  assert.ok(a.state.owned[id]);
  const b = G.pull(a.state, P * 2, 1, () => 0.9);
  assert.equal(b.results[0].dupe, false, '持っていない COMMON が残っていれば、かぶらない');
  assert.notEqual(b.results[0].kind + ':' + b.results[0].key, id);
  /* COMMON を全部持っている */
  const owned = {};
  for (const g of R.GACHA_ITEMS) if (g.rar === 'C') owned[g.kind + ':' + g.key] = 1;
  const full = { ...empty, owned };
  const c = G.pull(full, P, 1, () => 0.9);
  assert.equal(c.results[0].dupe, true);
  assert.equal(G.chipsOf(c.state, P), G.REFUND.C);
  assert.equal(G.collection(c.state).got, Object.keys(owned).length);
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

test('2台で別々に引いてから合わせると、使った CHIP は両方の合計 (ただで引けない)', async () => {
  const G = await load();
  store.delete('compileGacha');
  store.set('compileDeviceId', 'pc');
  const a = G.pull({ spent: 0, owned: {}, pulls: 0, pity: 0 }, 1000, 1, () => 0.9).state;
  store.set('compileDeviceId', 'phone');
  const b = G.pull({ spent: 0, owned: {}, pulls: 0, pity: 0 }, 1000, 1, () => 0.5).state;
  const m = JSON.parse(G.mergeGacha(JSON.stringify(a), JSON.stringify(b)));
  assert.equal(m.spent, G.PULL_COST * 2);
  /* 同じ中身を何度合わせても増えない。前の形 (spent だけ) も読める */
  assert.equal(JSON.parse(G.mergeGacha(JSON.stringify(m), JSON.stringify(m))).spent, G.PULL_COST * 2);
  assert.equal(JSON.parse(G.mergeGacha(JSON.stringify({ spent: 60, owned: {} }), JSON.stringify(m))).spent, 60 + G.PULL_COST * 2);
});

test('値下げ (30 → 15) の補償: それまでに使った CHIP の半分を1回だけ返す。同期で合わせても二重にならない', async () => {
  const G = await load();
  const st = { paid: { dev1: 90, dev2: 33 }, back: { dev1: 5 }, spent: 0, owned: {}, pulls: 4, pity: 0 };
  const merged = JSON.parse(G.mergeGacha(JSON.stringify(st), '{}'));
  const c = G.compensateOldPrice(merged);
  assert.equal(c.back[G.COMP_KEY], 65, '半分 (61.5) を 5 の倍数に切り上げ');
  assert.equal(c.spent, 123 - 5 - 65);
  assert.equal(G.compensateOldPrice(c), c, '2回目は返さない');
  /* 別の端末 (まだ補償していない) と合わせても、補償は1つ分 */
  const again = JSON.parse(G.mergeGacha(JSON.stringify(c), JSON.stringify(G.compensateOldPrice(JSON.parse(G.mergeGacha(JSON.stringify(st), '{}'))))));
  assert.equal(again.spent, 53);
  /* 引いたことのない人は 0 を置き、あとで引いた分 (新しい値段) は数えない */
  const fresh = G.compensateOldPrice(JSON.parse(G.mergeGacha('{}', '{}')));
  assert.equal(fresh.back[G.COMP_KEY], 0);
});

test('CHIP: 2026-09-27 からの経験値は 1 につき 3、それより前は 1 (前の分までは増やさない)', async () => {
  const C = await import('../js3d/chips.js');
  const before = C.CHIP_BOOST_FROM - 1000, after = C.CHIP_BOOST_FROM + 1000;
  /* 戦績: 負け 1・勝ち 3 (かんたん)。帳簿: 書いてある分 */
  const records = [{ win: false, level: 0, at: before }, { win: true, level: 0, at: after }];
  const log = [{ xp: 5, at: before }, { xp: 2, at: after }];
  assert.equal(C.CHIP_PER_XP, 3);
  assert.equal(C.earnedChips(records, log), 1 + 3 * 3 + 5 + 2 * 3);
});
