/* =========================================================================
 * 週替わり3連戦 (RUN の中のもう1つの遊び方)。画面は run-ui.js
 *   ・その週は全員に同じ 9つのプロトコルと、同じ3人の相手 (つよい → 挑戦者 → 最強) が配られる
 *   ・1戦ごとに、まだ使っていないプロトコルから3つ選んで戦う (1つのプロトコルは1回だけ)
 *   ・1試合は2本先取。負けたらその挑戦は終わり (週の間は何度でも挑戦できる)
 *   ・3戦とも勝てばクリア。ログインしていれば、その週のクリア者の一覧に名前を載せられる
 *   週の区切りは日本時間の月曜 0時
 * ========================================================================= */
import { STRONGEST_AI, CHALLENGERS, CHALLENGER_BASE } from './aidecks.js';

const KEY = 'compileWeekly';
const DAY = 86400e3;
const JST = 9 * 3600e3;

/* 週の番号 (1970-01-05 の月曜からの週数)。日本時間で数える */
export function weekIndex(now = Date.now()) {
  const day = Math.floor((now + JST) / DAY);      // 1970-01-01 (木) が 0
  return Math.floor((day + 3) / 7);                // 月曜始まり
}
export function weekKey(now = Date.now()) { return 'W' + weekIndex(now); }
/* その週の月曜と日曜 (表示用、日本時間の日付) */
export function weekRange(key) {
  const idx = +String(key).slice(1);
  const monday = (idx * 7 - 3) * DAY - JST;
  const fmt = (t) => { const d = new Date(t + JST); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); };
  return fmt(monday) + '〜' + fmt(monday + 6 * DAY);
}

/* 週の番号から決まる乱数 (全員が同じ9つと相手を引く) */
function seeded(key) {
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample(list, n, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/* その週の9つと3人の相手。names は全プロトコル名 (並び順が同じなら全員同じ結果) */
export function weeklySet(key, names) {
  const rnd = seeded(key);
  const pool = names.slice().sort();
  const nine = sample(pool, 9, rnd);
  const strong = sample(pool.filter(n => !nine.includes(n)), 3, rnd);
  const ch = Math.floor(rnd() * CHALLENGERS.length);
  return {
    week: key,
    nine,
    opponents: [
      { deck: strong, level: 2 },
      { deck: CHALLENGERS[ch].deck.slice(), level: CHALLENGER_BASE + ch },
      { deck: STRONGEST_AI.slice(), level: 3, boss: true }
    ]
  };
}

/* ---------- 挑戦の状態 (localStorage) ----------
   { v, week, attempt, stage (0..2), decks: [[3], ...], phase: 'choose' | 'battle' | 'lost' | 'clear', clears, submitted } */
function blank(key) { return { v: 1, week: key, attempt: 0, stage: 0, decks: [], phase: 'idle', clears: 0, bestStage: 0, submitted: false }; }

export function loadWeekly(key = weekKey()) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.v === 1 && s.week === key ? s : blank(key);    // 週が変わったら新しく
  } catch (e) {
    return blank(key);
  }
}
export function saveWeekly(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

export const usedOf = (s) => s.decks.flat();

export function startAttempt(s) {
  return { ...s, attempt: s.attempt + 1, stage: 0, decks: [], phase: 'choose' };
}

/* 3つ選んで戦う。まだ使っていない9つの中から、ちょうど3つ */
export function chooseDeck(s, deck, set) {
  if (s.phase !== 'choose' || !Array.isArray(deck) || deck.length !== 3 || new Set(deck).size !== 3) return s;
  const used = usedOf(s);
  if (!deck.every(n => set.nine.includes(n) && !used.includes(n))) return s;
  return { ...s, decks: s.decks.concat([deck.slice()]), phase: 'battle' };
}

export function finishMatch(s, win) {
  if (s.phase !== 'battle') return s;
  if (!win) return { ...s, phase: 'lost', bestStage: Math.max(s.bestStage, s.stage) };
  if (s.stage >= 2) return { ...s, phase: 'clear', clears: s.clears + 1, bestStage: 3 };
  return { ...s, stage: s.stage + 1, phase: 'choose', bestStage: Math.max(s.bestStage, s.stage + 1) };
}

/* 載せる名前: 前後の空白を除いて 1〜16文字、制御文字なし */
export function cleanName(name) {
  const s = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s.length >= 1 && s.length <= 16 ? s : null;
}
