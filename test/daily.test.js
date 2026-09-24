import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyMissions, advance, dayIndex, DAILY_XP } from '../js3d/daily.js';

const NAMES = ['FIRE', 'WATER', 'SPEED', 'DEATH', 'LIFE', 'LIGHT', 'DARKNESS', 'GRAVITY', 'METAL', 'PSYCHIC'];
const game = (o) => ({ win: false, level: 1, online: false, protocols: ['FIRE', 'WATER', 'SPEED'], compiles: 0, effects: 0, faceUp: 0, turns: 20, ...o });

test('毎日3つ (やさしい・ふつう・むずかしい)、同じ日なら同じ', () => {
  const a = dailyMissions(20000, NAMES), b = dailyMissions(20000, NAMES.slice().reverse());
  assert.deepEqual(a.map(m => m.tier), ['easy', 'mid', 'hard']);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(m => m.xp), [DAILY_XP.easy, DAILY_XP.mid, DAILY_XP.hard]);
});

test('日が変わるとミッションも変わる (30日で何種類も出る)', () => {
  const seen = new Set();
  for (let d = 0; d < 30; d++) for (const m of dailyMissions(20000 + d, NAMES)) seen.add(m.key);
  assert.ok(seen.size >= 8, seen.size);
});

test('日本時間の0時で日付が変わる', () => {
  const jstMidnight = Date.UTC(2026, 8, 24, 15, 0, 0);    // 9/25 0:00 JST
  assert.equal(dayIndex(jstMidnight) - dayIndex(jstMidnight - 1), 1);
});

test('advance: 進んで、目標に届いたら1回だけ達成。3つそろえば allNow', () => {
  const ms = [
    { key: 'easy:play1', tier: 'easy', id: 'play1', goal: 1 },
    { key: 'mid:win1', tier: 'mid', id: 'win1', goal: 1 },
    { key: 'hard:winStrong', tier: 'hard', id: 'winStrong', goal: 1 }
  ];
  let s = { day: 1, progress: {}, done: [] };
  let r = advance(s, ms, game({ win: false }));
  assert.deepEqual(r.cleared.map(m => m.key), ['easy:play1']);
  r = advance(r.state, ms, game({ win: true, level: 1 }));
  assert.deepEqual(r.cleared.map(m => m.key), ['mid:win1']);
  assert.equal(r.allNow, false);
  r = advance(r.state, ms, game({ win: true, online: true, level: null }));   // オンラインの勝ちは「つよい以上」扱い
  assert.deepEqual(r.cleared.map(m => m.key), ['hard:winStrong']);
  assert.equal(r.allNow, true);
  r = advance(r.state, ms, game({ win: true, level: 3 }));
  assert.equal(r.cleared.length, 0);
  assert.equal(r.allNow, false);
});

test('advance: 今日のプロトコルを入れていないと進まない', () => {
  const ms = [{ key: 'hard:protoWin', tier: 'hard', id: 'protoWin', goal: 1, proto: 'DEATH' }];
  const s = { day: 1, progress: {}, done: [] };
  assert.equal(advance(s, ms, game({ win: true })).cleared.length, 0);
  assert.equal(advance(s, ms, game({ win: true, protocols: ['DEATH', 'FIRE', 'LIFE'] })).cleared.length, 1);
});

test('advance: 元の状態は書き換えない', () => {
  const s = { day: 1, progress: {}, done: [] };
  advance(s, [{ key: 'easy:play1', tier: 'easy', id: 'play1', goal: 1 }], game({}));
  assert.deepEqual(s, { day: 1, progress: {}, done: [] });
});

test('どのミッションも1試合で届く (何試合もかかるもの・オンライン限定は無い)', () => {
  const big = game({ win: true, level: 3, compiles: 3, oppCompiles: 2, effects: 40, turns: 40,
    faceUpIds: ['DEATH_0', 'DEATH_1', 'DEATH_2', 'FIRE_0', 'FIRE_1', 'FIRE_2', 'WATER_0', 'WATER_1', 'WATER_2'] });
  for (let d = 0; d < 60; d++) {
    for (const m of dailyMissions(20000 + d, ['DEATH'])) {
      assert.notEqual(m.id, 'online1');
      const g = { ...big, protocols: ['DEATH', 'FIRE', 'WATER'] };
      assert.equal(advance({ day: d, progress: {}, done: [] }, [m], g).cleared.length, 1, m.key);
    }
  }
});

test('今日のプロトコルのカードを数える (違う種類だけ)', () => {
  const m = { key: 'mid:protoCards3', tier: 'mid', id: 'protoCards3', goal: 3, proto: 'DEATH' };
  const s = { day: 1, progress: {}, done: [] };
  assert.equal(advance(s, [m], game({ faceUpIds: ['DEATH_0', 'DEATH_3', 'FIRE_1'] })).state.progress['mid:protoCards3'], 2);
  assert.equal(advance(s, [m], game({ faceUpIds: ['DEATH_0', 'DEATH_3', 'DEATH_5'] })).cleared.length, 1);
});
