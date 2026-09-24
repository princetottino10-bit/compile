import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const { TROPHIES, newlyEarned, unlockTrophies, trophyView, hasPlatinum } = await import('../js3d/achievements.js');

const rec = (win, level = 1, me = ['FIRE', 'WATER', 'SPEED']) => ({ win, level, me, opp: ['DEATH', 'LIFE', 'LIGHT'] });
const ctx = (o = {}) => ({ records: [], xp: [], favorites: [], level: 1, cardWins: new Map(), game: null, ...o });
const ids = (list) => list.map(t => t.id).sort();

test('id は重ならず、どれも名前・条件・段がある', () => {
  assert.equal(new Set(TROPHIES.map(t => t.id)).size, TROPHIES.length);
  for (const t of TROPHIES) {
    assert.ok(t.name && t.desc && ['bronze', 'silver', 'gold', 'platinum'].includes(t.tier), t.id);
  }
  assert.ok(TROPHIES.filter(t => t.hidden).length >= 5);
});

test('何もしていなければ何も取れない', () => {
  assert.deepEqual(newlyEarned({}, ctx()), []);
});

test('積み上げ: 勝ち数・難易度・連勝', () => {
  const records = [rec(true, 2), rec(true, 3), rec(true), rec(true), rec(true)];
  const got = ids(newlyEarned({}, ctx({ records })));
  assert.ok(got.includes('first_win'));
  assert.ok(got.includes('strong'));
  assert.ok(got.includes('apex'));
  assert.ok(got.includes('streak5'));
  assert.ok(!got.includes('wins10'));
});

test('オンラインの勝ちも勝ち数に入る (帳簿で多く入った分)', () => {
  const xp = [{ id: 'k:room:A:40', src: 'online', xp: 8, at: 1 }, { id: 'k:room:B:40', src: 'online', xp: 3, at: 2 }];
  const got = ids(newlyEarned({}, ctx({ xp })));
  assert.deepEqual(got, ['first_win', 'online', 'online_win']);
});

test('その1試合: 完封・瀬戸際・早い勝ち (負けでは取れない)', () => {
  const game = { win: true, turns: 30, compiles: 3, oppCompiles: 0, winCompiles: 3, effectsMap: {}, faceUpIds: [], at: Date.UTC(2026, 0, 1, 3) };
  const got = ids(newlyEarned({}, ctx({ game })));
  assert.ok(got.includes('flawless'));
  assert.ok(got.includes('speed'));
  assert.ok(!got.includes('edge'));
  const edge = ids(newlyEarned({}, ctx({ game: { ...game, oppCompiles: 2, turns: 60 } })));
  assert.ok(edge.includes('edge'));
  const lost = ids(newlyEarned({}, ctx({ game: { ...game, win: false } })));
  assert.ok(!lost.includes('flawless') && !lost.includes('speed'));
});

test('取ったものは保存し、2回は出ない', () => {
  mem.clear();
  const c = ctx({ records: [rec(true)] });
  assert.deepEqual(ids(unlockTrophies(c, 100)), ['first_win']);
  assert.deepEqual(unlockTrophies(c, 200), []);
  const v = trophyView(c);
  assert.equal(v.done, 1);
  assert.equal(v.list.find(t => t.id === 'first_win').at, 100);
});

test('ほかを全部取ると PLATINUM', () => {
  mem.clear();
  const have = Object.fromEntries(TROPHIES.filter(t => t.id !== 'platinum' && t.id !== 'first_win').map(t => [t.id, 1]));
  mem.set('compileTrophies', JSON.stringify(have));
  assert.equal(hasPlatinum(), false);
  const got = ids(unlockTrophies(ctx({ records: [rec(true)] })));
  assert.deepEqual(got, ['first_win', 'platinum']);
  assert.equal(hasPlatinum(), true);
});

test('進み具合は取っていない積み上げの実績に出る', () => {
  mem.clear();
  const v = trophyView(ctx({ records: [rec(true), rec(true)] }));
  assert.deepEqual(v.list.find(t => t.id === 'wins10').prog, [2, 10]);
});
