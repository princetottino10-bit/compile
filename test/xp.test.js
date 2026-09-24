import test from 'node:test';
import assert from 'node:assert/strict';

/* localStorage の代わり */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const { grantXp, bonusXp, xpLog, hashKey, XP_GAIN, mergeXp, setXpHooks } = await import('../js3d/xp.js');
const { playerLevel } = await import('../js3d/stats-data.js');

test('grantXp: 足した分が帳簿の合計になる', () => {
  mem.clear();
  assert.equal(grantXp('online', 5), 5);
  assert.equal(grantXp('online', 2), 2);
  assert.equal(bonusXp(), 7);
  assert.equal(xpLog().length, 2);
});

test('grantXp: 同じ key では1回だけ', () => {
  mem.clear();
  assert.equal(grantXp('lesson', XP_GAIN.lesson, 'tu:0'), XP_GAIN.lesson);
  assert.equal(grantXp('lesson', XP_GAIN.lesson, 'tu:0'), 0);
  assert.equal(grantXp('lesson', XP_GAIN.lesson, 'tu:1'), XP_GAIN.lesson);
  assert.equal(bonusXp(), XP_GAIN.lesson * 2);
});

test('grantXp: 0 以下や小数は入らない', () => {
  mem.clear();
  assert.equal(grantXp('x', 0), 0);
  assert.equal(grantXp('x', -3), 0);
  assert.equal(grantXp('x', 1.5), 0);
  assert.equal(bonusXp(), 0);
});

test('壊れた帳簿は空として読む', () => {
  mem.clear();
  mem.set('compileXpLog', '{oops');
  assert.deepEqual(xpLog(), []);
  mem.set('compileXpLog', JSON.stringify([{ xp: 3 }, { xp: 'a' }, null]));
  assert.equal(bonusXp(), 3);
});

test('playerLevel: 戦績の経験値に帳簿の分が足される', () => {
  assert.equal(playerLevel([], 0).level, 1);
  assert.equal(playerLevel([], 4).level, 2);
  assert.equal(playerLevel([{ win: false }], 3).xp, 4);
});

test('hashKey: 同じ文字列は同じ key、違えば (たいてい) 違う', () => {
  assert.equal(hashKey('abc'), hashKey('abc'));
  assert.notEqual(hashKey('abc'), hashKey('abd'));
});

test('mergeXp: 別の端末の分を足す。同じ id は足さない', () => {
  mem.clear();
  grantXp('lesson', 2, 'tu:0');
  const added = mergeXp([
    { id: 'k:tu:0', src: 'lesson', xp: 2, at: 1 },          // 同じレッスン (こちらでも取った)
    { id: 'k:tu:1', src: 'lesson', xp: 2, at: 2 },
    { id: 'x5_online', src: 'online', xp: 8, at: 3 },
    { id: 'bad id!', src: 'online', xp: 8, at: 4 },          // 形が違う
    { id: 'x6_online', src: 'online', xp: 0, at: 5 }         // 0 は入れない
  ]);
  assert.equal(added, 2);
  assert.equal(bonusXp(), 12);
  assert.equal(grantXp('lesson', 2, 'tu:1'), 0);            // 取り込んだレッスンはもう入らない
});

test('grantXp: 入ったら onGrant に知らせる (アカウントへ送る口)', () => {
  mem.clear();
  const got = [];
  setXpHooks({ onGrant: (e) => got.push(e) });
  grantXp('online', 8, 'room:AB12:30');
  grantXp('online', 8, 'room:AB12:30');
  setXpHooks({ onGrant: null });
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'k:room:AB12:30');
  assert.equal(got[0].src, 'online');
});

test('以前の帳簿 (id なし) にも id を振って読む', () => {
  mem.clear();
  mem.set('compileXpLog', JSON.stringify([{ src: 'lesson', xp: 2, at: 10, key: 'tu:3' }, { src: 'online', xp: 5, at: 11 }]));
  const ids = xpLog().map(e => e.id);
  assert.deepEqual(ids, ['k:tu:3', 'x11_online']);
});
