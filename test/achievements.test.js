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

test('CONQUEROR: 「最強」に、最強のデッキ以外の42のプロトコルすべてで勝つ。進み具合は制覇の数', async () => {
  const t = TROPHIES.find(x => x.id === 'conqueror');
  assert.ok(t, 'conqueror がある');
  const names = Array.from({ length: 42 }, (_, i) => 'P' + i);
  const decks = [];
  for (let i = 0; i < 42; i += 3) decks.push(names.slice(i, i + 3));
  const { STRONGEST_AI } = await import('../js3d/aidecks.js');
  const vs = (d, lv = 3, opp = STRONGEST_AI) => ({ win: true, level: lv, me: d, opp });
  const all = decks.map(d => vs(d));
  assert.deepEqual(t.progress(ctx({ records: all.slice(0, 4) })), [12, 42]);
  assert.equal(t.test(ctx({ records: all.slice(0, 9) })), false, '前の 27 では足りない');
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


test('GAUNTLET: 強敵の欄の全員 (最強・本気の4人) に勝つ。本気の4人だけでは取れない', () => {
  mem.clear();
  const honki = [30, 31, 32, 33].map(lv => rec(true, lv));
  assert.ok(!ids(newlyEarned({}, ctx({ records: honki }))).includes('challengers'));
  assert.deepEqual(trophyView(ctx({ records: honki })).list.find(t => t.id === 'challengers').prog, [4, 5]);
  const all = honki.concat([rec(true, 3)]);
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

test('BLITZ は 28 手番以内の勝ち (短縮マッチは数えない)', () => {
  const base = { win: true, level: 1, turns: 28, compiles: 3, oppCompiles: 1, winCompiles: 3, effectsMap: {}, effects: 0, chainMax: 0,
    faceUpIds: [], faceUpVals: [], refreshes: 1, touched: 1, maxLine: 12, at: Date.UTC(2026, 0, 1, 12) };
  assert.ok(ids(newlyEarned({}, ctx({ game: base }))).includes('blitz'));
  assert.ok(!ids(newlyEarned({}, ctx({ game: { ...base, turns: 29 } }))).includes('blitz'));
  assert.ok(!ids(newlyEarned({}, ctx({ game: { ...base, short: true } }))).includes('blitz'));
});

test('BLITZ は戦績からもさかのぼって付く (CPU 戦・クイックだけ。勝ち抜き戦・週替わりの短い試合は数えない)', () => {
  const rec = (o) => ({ id: 'r' + Math.random(), me: ['FIRE', 'WATER', 'LIFE'], opp: ['DEATH', 'METAL', 'LIGHT'], win: true, level: 0, at: 1, turns: 22, ...o });
  assert.ok(ids(newlyEarned({}, ctx({ records: [rec({ mode: 'cpu' })] }))).includes('blitz'));
  assert.ok(!ids(newlyEarned({}, ctx({ records: [rec({ mode: 'run', turns: 12 }), rec({ mode: 'weekly', turns: 14 })] }))).includes('blitz'));
  assert.ok(!ids(newlyEarned({}, ctx({ records: [rec({ mode: 'cpu', turns: 29 }), rec({ mode: 'cpu', win: false, turns: 20 })] }))).includes('blitz'));
});

test('Main 3 / Aux 3・公式ソロモードの実績: BOT BREAKER・ROOT ACCESS・SEVEN SINS・TRISTATE', async () => {
  const { BOT_SCENARIOS } = await import('../js3d/bot-scenarios.js');
  const reg = BOT_SCENARIOS.filter(s => s.mode === 'regular');
  const five = reg.slice(0, 5).map(s => ({ win: true, level: s.level, me: ['ENVY', 'GREED', 'LUST'] }));
  assert.ok(!ids(newlyEarned({}, ctx({ records: five }))).includes('solo_regular'));
  const six = five.concat({ win: true, level: reg[5].level, me: ['PRIDE', 'SLOTH', 'WRATH'] });
  const got = ids(newlyEarned({}, ctx({ records: six })));
  assert.ok(got.includes('solo_regular'));
  assert.ok(!got.includes('solo_advanced'));
  assert.ok(!got.includes('sins7'));     // GLUTTONY がまだ
  const sins = six.concat({ win: true, level: 1, me: ['GLUTTONY', 'FIRE', 'WATER'] });
  assert.ok(ids(newlyEarned({}, ctx({ records: sins }))).includes('sins7'));
  assert.ok(!ids(newlyEarned({}, ctx({ records: [{ win: false, level: 1, me: ['FLEXIBLE', 'INERT', 'RIGID'] }] }))).includes('tristate'));
  assert.ok(ids(newlyEarned({}, ctx({ records: [{ win: true, level: 1, me: ['RIGID', 'FLEXIBLE', 'INERT'] }] }))).includes('tristate'));
});

test('やりこみの実績 (2026-11-03): Main 3・Aux 3・ソロモード・GATEKEEPER', async () => {
  const { STRONGEST_AI } = await import('../js3d/aidecks.js');
  const { BOT_SCENARIOS } = await import('../js3d/bot-scenarios.js');
  const T = (id) => TROPHIES.find(x => x.id === id);
  const apex = (me) => ({ win: true, level: 3, me, opp: STRONGEST_AI.slice() });
  /* Main 3 の12種で1勝 */
  const m3 = ['AMBUSH', 'ENVY', 'FULCRUM', 'GLUTTONY', 'GREED', 'LUST', 'MOMENTUM', 'NOVA', 'OVERWHELM', 'PRIDE', 'SLOTH', 'WRATH'];
  const m3decks = [0, 3, 6, 9].map(i => m3.slice(i, i + 3));
  assert.equal(T('m3_all').test(ctx({ records: m3decks.map(d => rec(true, 1, d)) })), true);
  assert.deepEqual(T('m3_all').progress(ctx({ records: m3decks.slice(0, 2).map(d => rec(true, 1, d)) })), [6, 12]);
  /* GATEKEEPER: 本物の最強のデッキだけ数える */
  assert.equal(T('m3_conquer').test(ctx({ records: m3decks.map(apex) })), true);
  assert.equal(T('m3_conquer').test(ctx({ records: m3decks.map(d => ({ ...apex(d), opp: ['A', 'B', 'C'] })) })), false);
  assert.equal(T('sins_apex').test(ctx({ records: [apex(['PRIDE', 'GREED', 'WRATH'])] })), true);
  assert.equal(T('sins_apex').test(ctx({ records: [apex(['PRIDE', 'GREED', 'NOVA'])] })), false, 'NOVA は大罪ではない');
  assert.equal(T('aux3_apex').test(ctx({ records: [apex(['INERT', 'RIGID', 'FLEXIBLE'])] })), true);
  /* Main 3 だけのデッキで10勝 */
  assert.equal(T('m3_pure').test(ctx({ records: Array(10).fill(rec(true, 1, ['NOVA', 'SLOTH', 'LUST'])) })), true);
  assert.equal(T('m3_pure').test(ctx({ records: Array(10).fill(rec(true, 1, ['NOVA', 'SLOTH', 'FIRE'])) })), false);
  /* 90枚 */
  const cards = [...m3, 'FLEXIBLE', 'INERT', 'RIGID'].flatMap(p => [1, 2, 3, 4, 5, 6].map(n => p + '_' + n));
  assert.equal(T('m3_cards').test(ctx({ records: [{ ...rec(true), cards }] })), true);
  assert.deepEqual(T('m3_cards').progress(ctx({ records: [{ ...rec(true), cards: cards.slice(0, 30).concat('FIRE_1') }] })), [30, 90]);
  /* ソロモード: ADVANCED の6つを新しい15種だけのデッキで */
  const adv = BOT_SCENARIOS.filter(s => s.mode === 'advanced');
  assert.equal(T('solo_m3').test(ctx({ records: adv.map(s => rec(true, s.level, ['NOVA', 'RIGID', 'ENVY'])) })), true);
  assert.equal(T('solo_m3').test(ctx({ records: adv.map(s => rec(true, s.level, ['NOVA', 'RIGID', 'FIRE'])) })), false);
  assert.equal(T('solo_first').test(ctx({ records: [rec(true, adv[0].level)] })), true);
  /* その1試合 */
  const game = { win: true, level: adv[0].level, oppCompiles: 0, winCompiles: 3, effectsMap: {}, faceUpIds: [] };
  assert.equal(T('solo_flawless').test(ctx({ game })), true);
  assert.equal(T('solo_flawless').test(ctx({ game: { ...game, level: 1 } })), false);
  assert.equal(T('apex_shutout').test(ctx({ game: { ...game, level: 3 } })), true);
  /* 「つよい」以上に10連勝 (かんたんは並びに入れない) */
  const strong = Array(10).fill(rec(true, 2));
  assert.equal(T('streak10').test(ctx({ records: strong })), true);
  assert.equal(T('streak10').test(ctx({ records: strong.slice(0, 5).concat(rec(false, 2), strong.slice(0, 5)) })), false);
  /* やりこみの称号はどれもオンラインで見せられる称号の一覧にある */
  const { TITLES } = await import('../js3d/rewards.js');
  const { TROPHY_TITLES } = await import('../js3d/cosmetics-ui.js').catch(() => ({ TROPHY_TITLES: null }));
  if (TROPHY_TITLES) for (const [id, key] of Object.entries(TROPHY_TITLES)) { assert.ok(T(id), id); assert.ok(TITLES[key], key); }
});
