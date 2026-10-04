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

test('CONQUEROR: 「最強」に、最強のデッキ以外の27のプロトコルすべてで勝つ。進み具合は制覇の数', async () => {
  const t = TROPHIES.find(x => x.id === 'conqueror');
  assert.ok(t, 'conqueror がある');
  const names = Array.from({ length: 27 }, (_, i) => 'P' + i);
  const decks = [];
  for (let i = 0; i < 27; i += 3) decks.push(names.slice(i, i + 3));
  const { STRONGEST_AI } = await import('../js3d/aidecks.js');
  const vs = (d, lv = 3, opp = STRONGEST_AI) => ({ win: true, level: lv, me: d, opp });
  const all = decks.map(d => vs(d));
  assert.deepEqual(t.progress(ctx({ records: all.slice(0, 4) })), [12, 27]);
  assert.equal(t.test(ctx({ records: all.slice(0, 8) })), false);
  assert.equal(t.test(ctx({ records: all })), true);
  assert.equal(t.test(ctx({ records: decks.map(d => vs(d, 5)) })), false, '挑戦者では取れない');
  assert.equal(t.test(ctx({ records: decks.map(d => vs(d, 3, ['A', 'B', 'C'])) })), false, 'ボス (デッキが違う) では取れない');
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
  assert.deepEqual(got, ['first_win']);
});

test('短縮マッチ (RUN・WEEKLY) の1試合は実績に数えない', () => {
  const game = { win: true, turns: 12, compiles: 2, oppCompiles: 0, winCompiles: 2, effectsMap: {}, faceUpIds: [], refreshes: 0, touched: 0, maxLine: 25, short: true, at: Date.UTC(2026, 0, 1, 3) };
  assert.deepEqual(ids(newlyEarned({}, ctx({ game }))), []);
});

test('縛りプレイ・記録の実績', () => {
  const base = { win: true, level: 3, turns: 40, compiles: 3, oppCompiles: 1, winCompiles: 3, effectsMap: {}, effects: 5, chainMax: 0,
    faceUpIds: ['FIRE_4'], faceUpVals: [3], refreshes: 0, touched: 0, maxLine: 12, short: false, at: Date.UTC(2026, 0, 1, 12) };
  const got = ids(newlyEarned({}, ctx({ game: base })));
  assert.ok(got.includes('norefresh') && got.includes('norefresh_apex') && got.includes('untouchable'));
  assert.ok(!got.includes('lowkey') && !got.includes('overkill'));
  const more = ids(newlyEarned({}, ctx({ game: { ...base, level: 1, refreshes: 2, touched: 1, faceUpIds: ['FIRE_1', 'GRAVITY_3'], faceUpVals: [0, 2], maxLine: 21, effects: 40, chainMax: 6, turns: 18 } })));
  assert.ok(more.includes('lowkey') && more.includes('overkill') && more.includes('overclock2') && more.includes('blitz'));
  assert.ok(!more.includes('norefresh') && !more.includes('untouchable'));
  const lost = ids(newlyEarned({}, ctx({ game: { ...base, win: false } })));
  assert.ok(!lost.includes('norefresh') && !lost.includes('lowkey'));
  /* 表で1枚も出さない勝ちは LOW KEY ではない (表で 0・1・2 を使って勝つ実績) */
  assert.ok(!ids(newlyEarned({}, ctx({ game: { ...base, faceUpIds: [], faceUpVals: [] } }))).includes('lowkey'));
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

test('COLLECTOR: 違うカードを60種類、表で出す (お気に入りの実績の代わり)', () => {
  const cards = Array.from({ length: 60 }, (_, i) => 'C' + (i % 30) + '_' + Math.floor(i / 30));
  const got = ids(newlyEarned({}, ctx({ records: [{ win: false, level: 1, me: ['FIRE'], cards }] })));
  assert.ok(got.includes('cards60'));
  const few = trophyView(ctx({ records: [{ win: false, level: 1, me: ['FIRE'], cards: cards.slice(0, 7) }] }));
  assert.deepEqual(few.list.find(t => t.id === 'cards60').prog, [7, 60]);
});


test('GAUNTLET: 強敵の欄の全員 (最強・ロック特化・挑戦者4人) に勝つ。挑戦者だけでは取れない', () => {
  mem.clear();
  const challengers = [5, 6, 7, 8].map(lv => rec(true, lv));
  assert.ok(!ids(newlyEarned({}, ctx({ records: challengers }))).includes('challengers'));
  assert.deepEqual(trophyView(ctx({ records: challengers })).list.find(t => t.id === 'challengers').prog, [4, 6]);
  const all = challengers.concat([rec(true, 3), rec(true, 4)]);
  assert.ok(ids(newlyEarned({}, ctx({ records: all }))).includes('challengers'));
});

test('タッグデュエルの実績 (戦績の mode が tag)', () => {
  const recs = (lvs) => lvs.map((level, i) => ({ win: true, level, mode: 'tag', me: ['FIRE', 'WATER', 'LIFE'], opp: ['DEATH', 'METAL', 'SPEED'], at: i + 1, cards: [] }));
  const one = ids(newlyEarned({}, ctx({ records: recs([0]) })));
  assert.ok(one.includes('tag_win') && !one.includes('tag5') && !one.includes('tag_strong'));
  const many = ids(newlyEarned({}, ctx({ records: recs([0, 1, 2, 2, 1]) })));
  assert.ok(many.includes('tag5') && many.includes('tag_strong') && many.includes('tag_all'));
  const solo = ids(newlyEarned({}, ctx({ records: recs([2]).map(r => ({ ...r, mode: 'cpu' })) })));
  assert.ok(!solo.includes('tag_win'));
  const game = { win: true, tag: true, turns: 40, compiles: 3, oppCompiles: 0, winCompiles: 3, effectsMap: {}, faceUpIds: ['FIRE_1'], refreshes: 1, touched: 1, maxLine: 12, short: false, at: Date.UTC(2026, 0, 1, 12) };
  assert.ok(ids(newlyEarned({}, ctx({ game }))).includes('tag_flawless'));
  assert.ok(!ids(newlyEarned({}, ctx({ game: { ...game, tag: false } }))).includes('tag_flawless'));
});

test('外した実績は「~id」の印で外れたまま。取り直すと印が 0 になって戻る', async () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const A = await import('../js3d/achievements.js?x=' + Date.now());
  store.compileTrophies = JSON.stringify({ lowkey: 100, '~lowkey': 200, first_win: 50 });
  assert.deepEqual(Object.keys(A.loadTrophies()).sort(), ['first_win']);
  const game = { win: true, turns: 40, compiles: 3, oppCompiles: 1, winCompiles: 3, effectsMap: {}, effects: 1, faceUpIds: ['FIRE_1'], faceUpVals: [0], refreshes: 2, touched: 3, maxLine: 10, short: false, at: Date.UTC(2026, 0, 1, 12) };
  A.unlockTrophies(ctx({ game }), 300);
  assert.ok(A.loadTrophies().lowkey, '取り直したら戻る');
  assert.equal(JSON.parse(store.compileTrophies)['~lowkey'], 0);
});

test('1つの手番に効果を10回・15回発動させる', async () => {
  const { newlyEarned } = await import('../js3d/achievements.js');
  const base = { win: false, level: 1, turns: 30, compiles: 1, oppCompiles: 2, winCompiles: 3, effectsMap: {}, effects: 20, faceUpIds: [], faceUpVals: [], short: false, at: Date.UTC(2026, 0, 1, 12) };
  const ids = (l) => l.map(t => t.id);
  const c = (game) => ({ records: [], xp: [], level: 1, cardWins: new Map(), game, gacha: { owned: {} } });
  assert.ok(!ids(newlyEarned({}, c({ ...base, turnFxMax: 9 }))).includes('turnfx10'));
  const ten = ids(newlyEarned({}, c({ ...base, turnFxMax: 10 })));
  assert.ok(ten.includes('turnfx10') && !ten.includes('turnfx15'));
  assert.ok(ids(newlyEarned({}, c({ ...base, turnFxMax: 15 }))).includes('turnfx15'));
  assert.ok(!ids(newlyEarned({}, c({ ...base, turnFxMax: 15, short: true }))).includes('turnfx15'), '短縮マッチは数えない');
});
