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
    if (kind === 'bgm' && !R.BGM_RELEASED) continue;          // BGM はしまっている間は手に入らない
    for (const [key] of list.slice(1)) {
      assert.ok(R.REWARDS.some(r => r.kind === kind && r.key === key) || R.GACHA_ITEMS.some(g => g.kind === kind && g.key === key) ||
        R.UNDERDOG_ITEMS.some(g => g.kind === kind && g.key === key) || R.WEEKLY_ITEMS.some(g => g.kind === kind && g.key === key) ||
        R.MASTERY_ITEMS.some(g => g.kind === kind && g.key === key) || R.AVATAR_GACHA.some(g => g.kind === kind && g.key === key) ||
        R.FREE_ITEMS.some(g => g.kind === kind && g.key === key) || R.TROPHY_ITEMS.some(g => g.kind === kind && g.key === key) ||
        (kind === 'avatar' && R.AVATAR_FREE.includes(key)),
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


test('プロトコルの習熟度: 3 で名札・6 で称号・9 でプレイマット (45 プロトコルそれぞれ)', async () => {
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
  assert.equal(R.MASTERY_ITEMS.filter(m => m.kind === 'title').length, 45);
  setRecs(wins(39).map(r => ({ ...r, mode: 'tutorial' })));   // チュートリアルの対戦は数えない
  assert.equal(R.protoMastery('FIRE'), 0);
  delete globalThis.localStorage;
});

test('Main 3 の実績の褒美: 実績を取るとスリーブ・マーカーが開き、外した実績では閉じる。CLASSIC ははじめから', async () => {
  const store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  try {
    const R = await load();
    assert.equal(R.unlockLevel('sleeve', 'classic'), 1);
    for (const it of R.TROPHY_ITEMS) {
      assert.ok(R.COSMETICS[it.kind].some(([k]) => k === it.key), it.key + ' は COSMETICS にある');
      assert.equal(R.unlockLevel(it.kind, it.key), 9999);
    }
    store.compileTrophies = JSON.stringify({ sins7: 1, tristate: 2, '~tristate': 3 });
    assert.equal(R.unlockLevel('sleeve', 'sins'), 1);
    assert.equal(R.unlockLevel('marker', 'tristate'), 9999, '外した実績では開かない');
    assert.equal(R.unlockLevel('sleeve', 'rootaccess'), 9999);
  } finally { delete global.localStorage; }
});

test('実績の褒美の実績は、どれも achievements.js にある', async () => {
  const R = await load();
  const A = await import('../js3d/achievements.js');
  for (const it of R.TROPHY_ITEMS) assert.ok(A.TROPHIES.some(t => t.id === it.trophy), it.trophy);
});

test('勝ちの演出・コンパイルの光・マーカー・名札は、どれも描き方がある (2026-11-03 の追加分も)', async () => {
  const R = await load();
  const { VICTORY_FX } = await import('../js3d/backdrops.js');
  for (const [key] of R.COSMETICS.victory) assert.ok(VICTORY_FX[key], 'victory ' + key);
  const fs = require('node:fs');
  const ctrl = fs.readFileSync(require.resolve('../js3d/control.js'), 'utf8');
  const styles = ctrl.slice(ctrl.indexOf('export const MARKER_STYLES'), ctrl.indexOf('const PATTERN_DRAW'));
  for (const [key] of R.COSMETICS.marker) assert.ok(new RegExp('\\b' + key + ':').test(styles), 'marker ' + key);
  const fx = fs.readFileSync(require.resolve('../js3d/fx-compile.js'), 'utf8');
  const signs = /const SIGNS = \{([^}]*)\}/.exec(fx)[1];
  for (const [key] of R.COSMETICS.ccolor.slice(1)) assert.ok(signs.split(',').map(x => x.trim()).includes(key), 'ccolor ' + key);
  const html = fs.readFileSync(require.resolve('../three-play.html'), 'utf8');
  for (const [key] of R.COSMETICS.plate.slice(1)) if (!/^p_/.test(key)) assert.ok(html.includes('[data-frame="' + key + '"]'), 'plate ' + key);
});
