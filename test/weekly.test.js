/* 週替わり3連戦 (weekly.js): 同じ週は全員同じ9つと相手、プロトコルは1回ずつ、負けたら終わり */
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = () => import('../js3d/weekly.js');
const NAMES = ['APATHY', 'CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'DARKNESS', 'DEATH', 'FEAR', 'FIRE', 'GRAVITY',
  'HATE', 'ICE', 'LIFE', 'LIGHT', 'LOVE', 'LUCK', 'METAL', 'MIRROR', 'PEACE', 'PLAGUE', 'PSYCHIC', 'SMOKE', 'SPEED',
  'SPIRIT', 'TIME', 'WAR', 'WATER', 'ASSIMILATION', 'DIVERSITY', 'UNITY'];

test('週の区切りは日本時間の月曜0時。同じ週は同じ9つと相手 (名前の並び順によらない)', async () => {
  const W = await load();
  const sunNight = Date.UTC(2026, 8, 27, 14, 59);   // 9/27 (日) 23:59 JST
  const monMorning = Date.UTC(2026, 8, 27, 15, 0);  // 9/28 (月) 0:00 JST
  assert.notEqual(W.weekKey(sunNight), W.weekKey(monMorning));
  assert.equal(W.weekRange(W.weekKey(monMorning)), '9/28〜10/4');
  const a = W.weeklySet(W.weekKey(monMorning), NAMES);
  const b = W.weeklySet(W.weekKey(monMorning), NAMES.slice().reverse());
  assert.deepEqual(a, b);
  assert.equal(new Set(a.nine).size, 9);
  assert.ok(a.opponents[0].deck.every(n => !a.nine.includes(n)), '1人目の相手は9つと重ならない');
  assert.ok(a.opponents[2].boss);
  assert.notDeepEqual(W.weeklySet('W1000', NAMES).nine, W.weeklySet('W1001', NAMES).nine);
});

test('1戦ごとに未使用の3つを選ぶ。使ったものは選べず、3勝でクリア、負けたら終わり', async () => {
  const W = await load();
  const set = W.weeklySet('W3000', NAMES);
  let s = W.startAttempt(W.loadWeekly('W3000'));
  assert.equal(s.phase, 'choose');
  const [d1, d2, d3] = [set.nine.slice(0, 3), set.nine.slice(3, 6), set.nine.slice(6, 9)];
  s = W.chooseDeck(s, d1, set);
  assert.equal(s.phase, 'battle');
  s = W.finishMatch(s, true);
  assert.equal(s.stage, 1);
  assert.equal(W.chooseDeck(s, [d1[0], d2[0], d2[1]], set), s, '使ったプロトコルは選べない');
  assert.equal(W.chooseDeck(s, ['FIRE', 'FIRE', 'FIRE'], set), s);
  s = W.finishMatch(W.chooseDeck(s, d2, set), true);
  s = W.finishMatch(W.chooseDeck(s, d3, set), true);
  assert.equal(s.phase, 'clear');
  assert.equal(s.clears, 1);
  let t = W.startAttempt(s);
  t = W.finishMatch(W.chooseDeck(t, d1, set), false);
  assert.equal(t.phase, 'lost');
  assert.equal(t.attempt, 2);
});

test('載せる名前は 1〜16 文字', async () => {
  const W = await load();
  assert.equal(W.cleanName('  たろう '), 'たろう');
  assert.equal(W.cleanName(''), null);
  assert.equal(W.cleanName('x'.repeat(17)), null);
});
