/* 見た目のレア度 (cos-rarity.js): ガチャはそのまま、ほかは手に入れる難しさから */
const test = require('node:test');
const assert = require('node:assert');
const load = () => import('../js3d/cos-rarity.js');

test('はじめからのものは印なし、ガチャの品物はガチャのレア度', async () => {
  const { rarityOf } = await load();
  assert.equal(rarityOf('sleeve', 'default', { defaultKey: 'default' }), null);
  assert.equal(rarityOf('title', ''), null);
  assert.equal(rarityOf('sleeve', 'galaxy', { defaultKey: 'default' }), 'L');
  assert.equal(rarityOf('sleeve', 'mint', { defaultKey: 'default' }), 'C');
});

test('レベルの報酬は解放のレベルが高いほど上、習熟度・実績・交換も段がつく', async () => {
  const { rarityOf } = await load();
  assert.equal(rarityOf('sleeve', 'crimson', { defaultKey: 'default' }), 'C');   // LV 2
  assert.equal(rarityOf('mat', 'prism', { defaultKey: 'neon' }), 'E');          // LV 20
  assert.equal(rarityOf('mat', 'p_fire', { defaultKey: 'neon' }), 'E');         // 習熟度 9 (数が多いので EPIC まで)
  assert.equal(rarityOf('plate', 'p_fire', { defaultKey: 'default' }), 'R');    // 習熟度 3
  assert.equal(rarityOf('title', 'grandmaster'), 'L');                            // 金の実績
  assert.equal(rarityOf('title', 'puzzler'), 'E');                                // 銀の実績
  assert.equal(rarityOf('title', 'platinum'), 'L');
  assert.equal(rarityOf('icon', 'smile', { shopPrice: 150 }), 'E');
  assert.equal(rarityOf('sleeve', 'laurel', { defaultKey: 'default' }), 'R');   // 週替わり 1 週
});

test('どの品物のレア度も C / R / E / L か null', async () => {
  const { rarityOf, RARITIES } = await load();
  const { COSMETICS } = await import('../js3d/rewards.js');
  for (const [kind, items] of Object.entries(COSMETICS)) {
    for (const [key] of items) {
      const r = rarityOf(kind, key);
      assert.ok(r === null || RARITIES.includes(r), kind + ':' + key + ' → ' + r);
    }
  }
});
