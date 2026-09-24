/* =========================================================================
 * デイリーミッション: 毎日 (日本時間の0時) 3つ。やさしい・ふつう・むずかしい から1つずつ。
 *   CPU 戦 (RUN・WEEKLY・下剋上も)・オンライン対戦の決着ごとに進む。
 *   達成すると経験値 (xp.js)。3つそろうとおまけ。
 *   保存はブラウザ (compileDaily)。アカウントの保存 (cloudsave.js) にも入る
 * ========================================================================= */

const KEY = 'compileDaily';
const DAY = 86400000, JST = 9 * 3600000;
const STRONG = 2;                      // aidecks.js の「つよい」

export const DAILY_XP = { easy: 2, mid: 3, hard: 5, all: 3 };

export function dayIndex(now = Date.now()) { return Math.floor((now + JST) / DAY); }

/* ミッションの種類。goal: 目標、add(g): その試合で進む量。p: 今日のプロトコル (proto 付きのものだけ) */
const POOL = {
  easy: [
    { id: 'play2', goal: 2, text: () => '2戦する', add: () => 1 },
    { id: 'faceup10', goal: 10, text: () => 'カードを表で10枚出す', add: (g) => g.faceUp },
    { id: 'effects12', goal: 12, text: () => '自分のカードの効果を12回使う', add: (g) => g.effects },
    { id: 'protoPlay', goal: 1, proto: true, text: (p) => p + ' を入れて1戦する', add: (g, p) => (g.protocols.includes(p) ? 1 : 0) }
  ],
  mid: [
    { id: 'win1', goal: 1, text: () => '1勝する', add: (g) => (g.win ? 1 : 0) },
    { id: 'compile4', goal: 4, text: () => 'コンパイルを4回する', add: (g) => g.compiles },
    { id: 'online1', goal: 1, text: () => 'オンライン対戦を1戦する', add: (g) => (g.online ? 1 : 0) },
    { id: 'play4', goal: 4, text: () => '4戦する', add: () => 1 }
  ],
  hard: [
    { id: 'winStrong', goal: 1, text: () => '「つよい」以上の相手 (オンラインも) に勝つ', add: (g) => (g.win && (g.online || g.level >= STRONG) ? 1 : 0) },
    { id: 'protoWin', goal: 1, proto: true, text: (p) => p + ' を入れて1勝する', add: (g, p) => (g.win && g.protocols.includes(p) ? 1 : 0) },
    { id: 'win3', goal: 3, text: () => '3勝する', add: (g) => (g.win ? 1 : 0) },
    { id: 'fastWin', goal: 1, text: () => '16手番以内 (両者合わせて) で勝つ', add: (g) => (g.win && g.turns > 0 && g.turns <= 16 ? 1 : 0) }
  ]
};
const TIERS = ['easy', 'mid', 'hard'];

/* 日付から決まる乱数 (どの端末でも同じミッションになる) */
function seeded(n) {
  let s = (n * 2654435761) >>> 0 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/* その日のミッション [{ key, tier, id, goal, text, proto, xp }] */
export function dailyMissions(day, names) {
  const rnd = seeded(day + 7);
  const list = (names || []).slice().sort();
  const proto = list.length ? list[Math.floor(rnd() * list.length)] : null;
  return TIERS.map((tier) => {
    const pool = POOL[tier].filter(m => !m.proto || proto);
    const m = pool[Math.floor(rnd() * pool.length)];
    return { key: tier + ':' + m.id, tier, id: m.id, goal: m.goal, text: m.text(proto), proto: m.proto ? proto : null, xp: DAILY_XP[tier] };
  });
}

function blank(day) { return { day, progress: {}, done: [] }; }

export function loadDaily(now = Date.now()) {
  const day = dayIndex(now);
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.day === day && s.progress && Array.isArray(s.done) ? s : blank(day);
  } catch (e) {
    return blank(day);
  }
}
function saveDaily(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }

/* 1試合ぶん進める (純粋な計算)。
   game: { win, level, online, protocols: [名前], compiles, effects, faceUp, turns }
   返り値 { state: 新しい状態, cleared: [今回達成したミッション], allNow: 今回で3つそろったか } */
export function advance(state, missions, game) {
  const g = { win: !!game.win, level: game.level == null ? -1 : game.level, online: !!game.online,
    protocols: game.protocols || [], compiles: game.compiles | 0, effects: game.effects | 0, faceUp: game.faceUp | 0, turns: game.turns | 0 };
  const progress = { ...state.progress };
  const cleared = [];
  for (const m of missions) {
    if (state.done.includes(m.key)) continue;
    const def = POOL[m.tier].find(x => x.id === m.id);
    const n = Math.min(m.goal, (progress[m.key] || 0) + Math.max(0, def.add(g, m.proto) | 0));
    progress[m.key] = n;
    if (n >= m.goal) cleared.push(m);
  }
  const done = state.done.concat(cleared.map(m => m.key));
  const allNow = cleared.length > 0 && missions.every(m => done.includes(m.key));
  return { state: { ...state, progress, done }, cleared, allNow };
}

/* ブラウザの保存を読み書きして1試合ぶん進める */
export function recordDailyGame(game, names, now = Date.now()) {
  const s = loadDaily(now);
  const missions = dailyMissions(s.day, names);
  const r = advance(s, missions, game);
  saveDaily(r.state);
  return { ...r, day: s.day };
}

/* 表示用: 今日のミッションと進み具合 */
export function dailyView(names, now = Date.now()) {
  const s = loadDaily(now);
  return dailyMissions(s.day, names).map(m => ({ ...m, n: s.progress[m.key] || 0, done: s.done.includes(m.key) }));
}
