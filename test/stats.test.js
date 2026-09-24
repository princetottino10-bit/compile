/* 戦績 (stats.js): アカウントと同期するための id と、別の端末の記録の取り込み */
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const KEY = 'compileSoloRecords';
const load = () => import('../js3d/stats.js');
const deck = (a, b, c) => [a, b, c];

test('以前の記録 (id なし) は日時から同じ id を振る', async () => {
  const S = await load();
  store.set(KEY, JSON.stringify([{ me: deck('FIRE', 'WATER', 'SPEED'), opp: deck('LIFE', 'LIGHT', 'METAL'), win: true, level: 1, at: 1790000000000 }]));
  const a = S.localRecords(), b = S.localRecords();
  assert.equal(a[0].id, 't1790000000000');
  assert.equal(a[0].id, b[0].id, '読むたびに同じ id');
  assert.match(a[0].id, /^[A-Za-z0-9_-]{8,40}$/, 'アカウントの表の id の形に合う');
});

test('新しい1戦には id が付き、アカウント連携に渡される', async () => {
  const S = await load();
  store.set(KEY, '[]');
  const sent = [];
  S.setStatsHooks({ onRecord: (r) => sent.push(r) });
  S.recordSoloResult(deck('FIRE', 'WATER', 'SPEED'), deck('LIFE', 'LIGHT', 'METAL'), false, 2);
  S.setStatsHooks({ onRecord: null });
  const list = S.localRecords();
  assert.equal(list.length, 1);
  assert.match(list[0].id, /^[A-Za-z0-9_-]{8,40}$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, list[0].id);
});

test('別の端末の記録は足し、同じ id は重ねない (日時順に並ぶ)', async () => {
  const S = await load();
  store.set(KEY, JSON.stringify([{ id: 'tlocal0001', me: deck('A', 'B', 'C'), opp: deck('D', 'E', 'F'), win: true, level: 0, at: 2000 }]));
  const added = S.mergeRecords([
    { id: 'tlocal0001', me: deck('A', 'B', 'C'), opp: deck('D', 'E', 'F'), win: true, level: 0, at: 2000 },
    { id: 'tremote001', me: deck('G', 'H', 'I'), opp: deck('J', 'K', 'L'), win: false, level: 1, at: 1000 }
  ]);
  assert.equal(added, 1);
  assert.deepEqual(S.localRecords().map(r => r.id), ['tremote001', 'tlocal0001']);
  assert.equal(S.mergeRecords([{ id: 'tremote001', me: [], opp: [], win: false, level: 1, at: 1000 }]), 0, '2回目は何も足さない');
});

/* ---------- 集計 (stats-data.js) ---------- */
const loadData = () => import('../js3d/stats-data.js');
const rec = (me, opp, win, level, turns) => ({ id: 'x', me, opp, win, level, at: 0, turns });

test('習熟度: 1戦 +1、勝ち +2、つよい以上に勝てば +1。段階で Lv が上がる', async () => {
  const D = await loadData();
  const m = D.protocolSummary([
    rec(deck('FIRE', 'WATER', 'SPEED'), deck('A', 'B', 'C'), true, 3),
    rec(deck('FIRE', 'LIFE', 'LIGHT'), deck('A', 'B', 'C'), false, 1)
  ]);
  const fire = m.get('FIRE');
  assert.equal(fire.games, 2);
  assert.equal(fire.xp, 1 + 2 + 1 + 1);
  assert.equal(fire.mastery.level, 2, 'xp 5 は Lv2 (3 以上 8 未満)');
  assert.ok(fire.wonStrong && fire.wonStrongest && fire.won);
  assert.equal(m.get('LIFE').won, false);
  assert.equal(D.masteryLevel(0).level, 1);
  assert.equal(D.masteryLevel(150).next, null, '最大 Lv は次が無い');
});

test('相性・勝率の推移・最短ターン勝利', async () => {
  const D = await loadData();
  const list = [
    rec(deck('FIRE', 'WATER', 'SPEED'), deck('LOVE', 'B', 'C'), true, 1, 30),
    rec(deck('FIRE', 'WATER', 'SPEED'), deck('LOVE', 'B', 'C'), false, 1, 20),
    rec(deck('FIRE', 'WATER', 'SPEED'), deck('LOVE', 'B', 'C'), true, 3, 24)
  ];
  const mu = D.matchups(list).get('FIRE|LOVE');
  assert.deepEqual([mu.n, mu.w], [3, 2]);
  assert.deepEqual(D.winTrend(list, 2, 10), [0.5, 0.5]);
  assert.equal(D.fastestWin(list).turns, 24, '負けた試合の短さは数えない');
  assert.equal(D.fastestWin(list, r => r.level >= 3).turns, 24);
  assert.equal(D.fastestWin([]), null);
});

test('カードの戦績: 表で出した試合と勝った試合を数え、勝ち数で光り方が決まる', async () => {
  const D = await loadData();
  const list = [
    { ...rec(deck('A', 'B', 'C'), deck('D', 'E', 'F'), true, 1), cards: ['FIRE_1', 'WATER_5'] },
    { ...rec(deck('A', 'B', 'C'), deck('D', 'E', 'F'), false, 1), cards: ['FIRE_1'] },
    rec(deck('A', 'B', 'C'), deck('D', 'E', 'F'), true, 1)              // 以前の記録 (cards なし)
  ];
  const cs = D.cardStats(list);
  assert.deepEqual([cs.get('FIRE_1').games, cs.get('FIRE_1').wins], [2, 1]);
  assert.equal(D.cardTier(2), null);
  assert.equal(D.cardTier(3).key, 'bronze');
  assert.equal(D.cardTier(24).key, 'silver');
  assert.equal(D.cardTier(80).key, 'holo');
});

test('お気に入り: 10枚まで、1プロトコル1枚まで (同じプロトコルは入れ替え)。以前の1枚は引き継ぐ', async () => {
  const S = await load();
  store.delete('compileFavCards');
  store.set('compileFavCard', 'FIRE_1');
  assert.deepEqual(S.favoriteCards(), ['FIRE_1'], '以前の1枚を読む');
  const r1 = S.toggleFavoriteCard('FIRE_3');
  assert.ok(r1.ok && /入れ替え/.test(r1.message));
  assert.deepEqual(S.favoriteCards(), ['FIRE_3']);
  assert.equal(store.has('compileFavCard'), false, '以前の保存は消す');
  const names = ['WATER', 'SPEED', 'DARKNESS', 'HATE', 'SMOKE', 'LIFE', 'LIGHT', 'PLAGUE', 'METAL'];
  for (const n of names) assert.ok(S.toggleFavoriteCard(n + '_1').ok);
  assert.equal(S.favoriteCards().length, 10);
  const over = S.toggleFavoriteCard('LOVE_1');
  assert.equal(over.ok, false, '11枚目は選べない');
  assert.ok(S.toggleFavoriteCard('METAL_4').ok, '同じプロトコルなら10枚でも入れ替えられる');
  assert.ok(S.toggleFavoriteCard('FIRE_3').ok, '外す');
  assert.equal(S.favoriteCards().length, 9);
});

test('効果の発動回数: 記録には { defId: 回数 } だけを残し、カードごとに合計する', async () => {
  const S = await load();
  assert.deepEqual(S.cleanEffects({ FIRE_1: 2, bad: 3, WATER_5: 0, SPEED_2: 1.5, LIFE_3: 5000 }), { FIRE_1: 2, LIFE_3: 999 });
  const D = await loadData();
  const cs = D.cardStats([
    { ...rec(deck('A', 'B', 'C'), deck('D', 'E', 'F'), true, 1), cards: ['FIRE_1'], effects: { FIRE_1: 3, WATER_2: 1 } },
    { ...rec(deck('A', 'B', 'C'), deck('D', 'E', 'F'), false, 1), cards: ['FIRE_1'], effects: { FIRE_1: 2 } }
  ]);
  assert.equal(cs.get('FIRE_1').effects, 5);
  assert.equal(cs.get('WATER_2').effects, 1, '表で出していない (裏から返った) 札の発動も数える');
  assert.equal(cs.get('WATER_2').games, 0);
});
