/* レベルの報酬 (rewards.js): 解放のレベル・レベルアップで手に入るもの・称号 */
const test = require('node:test');
const assert = require('node:assert');
const load = () => import('../js3d/rewards.js');

test('見た目の解放: はじめからのものは Lv1、報酬のものはそのレベルから', async () => {
  const R = await load();
  assert.equal(R.unlockLevel('sleeve', 'default'), 1);
  assert.equal(R.unlockLevel('sleeve', 'crimson'), 2);
  assert.equal(R.unlockLevel('mat', 'prism'), 20);
  assert.equal(R.isUnlocked('mat', 'nebula', 2), false);
  assert.equal(R.isUnlocked('mat', 'nebula', 3), true);
  for (const [kind, list] of Object.entries(R.COSMETICS)) {
    for (const [key] of list.slice(1)) {
      assert.ok(R.REWARDS.some(r => r.kind === kind && r.key === key) || R.GACHA_ITEMS.some(g => g.kind === kind && g.key === key) ||
        R.UNDERDOG_ITEMS.some(g => g.kind === kind && g.key === key) || R.WEEKLY_ITEMS.some(g => g.kind === kind && g.key === key) ||
        R.MASTERY_ITEMS.some(g => g.kind === kind && g.key === key),
        kind + '/' + key + ' は報酬の一覧・ガチャ・下剋上・週替わりのどれかにある');
    }
  }
});

test('レベルアップで手に入る報酬・次の報酬・称号', async () => {
  const R = await load();
  assert.deepEqual(R.rewardsBetween(4, 5).map(r => r.key), ['compiler', 'icon']);
  assert.equal(R.rewardsBetween(10, 10).length, 0);
  assert.equal(R.nextReward(8).lv, 9);
  assert.equal(R.nextReward(20).lv, 22);
  assert.equal(R.nextReward(30), null);
  /* 称号はどれもオンラインで相手に見せられる (サーバーの BADGES と同じ key) */
  const server = require('node:fs').readFileSync(require('node:path').join(__dirname, '../supabase/functions/secure-room/index.ts'), 'utf8');
  for (const key of Object.keys(R.TITLES)) assert.ok(server.includes('"' + key + '"'), key + ' はサーバーの BADGES にある');
  /* データベースの部屋の称号の列も同じ一覧を受け付ける (一番新しいマイグレーションの check) */
  const fs = require('node:fs'), path = require('node:path');
  const dir = path.join(__dirname, '../supabase/migrations');
  const last = fs.readdirSync(dir).filter(f => /room_badges/.test(f)).sort().pop();
  const sql = fs.readFileSync(path.join(dir, last), 'utf8');
  for (const key of Object.keys(R.TITLES)) assert.ok(sql.includes("'" + key + "'"), key + ' は部屋の称号の列で受け付ける (' + last + ')');
  assert.deepEqual(R.ownedTitles(10, ['underdog']), ['compiler', 'veteran', 'underdog']);
  assert.deepEqual(R.ownedTitles(1, []), []);
});

test('全部解放 (管理者のテスト用) では、見た目も称号もレベル1から使える', async () => {
  const R = await import('../js3d/rewards.js');
  R.setUnlockAll(true);
  try {
    assert.equal(R.unlockLevel('mat', 'prism'), 1);
    assert.equal(R.isUnlocked('sleeve', 'holo', 1), true);
    assert.deepEqual(R.ownedTitles(1, []).sort(), Object.keys(R.TITLES).sort());
  } finally {
    R.setUnlockAll(false);
  }
  assert.ok(R.unlockLevel('mat', 'prism') > 1);
});


test('プロトコルの習熟度: 3 で名札・6 で称号・9 でプレイマット (30 プロトコルそれぞれ)', async () => {
  const R = await load();
  const wins = (n) => Array.from({ length: n }, () => ({ win: true, level: 1, me: ['FIRE', 'WATER', 'SPEED'] }));
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const setRecs = (list) => globalThis.localStorage.setItem('compileSoloRecords', JSON.stringify(list));
  setRecs(wins(3));                                   // 3 戦 3 勝 = 9 xp → 習熟度 3
  assert.equal(R.protoMastery('FIRE'), 3);
  assert.equal(R.isUnlocked('plate', 'p_fire', 1), true);
  assert.equal(R.isUnlocked('title', 'm_fire', 1), false);
  assert.ok(!R.ownedTitles(1, []).includes('m_fire'));
  setRecs(wins(14));                                  // 42 xp → 6
  assert.ok(R.ownedTitles(1, []).includes('m_fire'));
  assert.equal(R.isUnlocked('mat', 'p_fire', 1), false);
  setRecs(wins(39));                                  // 117 xp → 9
  assert.equal(R.isUnlocked('mat', 'p_fire', 1), true);
  assert.equal(R.isUnlocked('mat', 'p_death', 99), false, '遊んでいないプロトコルは開かない');
  assert.equal(R.TITLES.m_fire, 'PYROMANCER');
  assert.equal(R.MASTERY_ITEMS.filter(m => m.kind === 'title').length, 30);
  delete globalThis.localStorage;
});
