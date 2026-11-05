/* =========================================================================
 * GATEKEEPER 連勝 (CHALLENGE の「連勝」タブ)
 *   負けるまで GATEKEEPER と戦い続ける。1試合ごとに自分の3つを選び直せる (相手のデッキはいつも GATEKEEPER のもの)。
 *   勝つたびに、GATEKEEPER に勝ち抜き戦のボスのルールが1つずつ足されていく (STAGES。足したものは外れない)。
 *   全部そろったあとは、そのままの強さで続く。負けたら連勝は 0 に戻り、最高記録 (best) だけ残る。
 *   1試合はふつうの3本先取 (短縮マッチではない)。戦績には GATEKEEPER との CPU 戦として残る。
 *   対戦の途中で画面を閉じたら (phase が battle のまま開いた)、その段は1回だけやり直せる。2回目からは負けの扱い
 *   (わざと閉じて負けを消せないように。週替わり3連戦の canResume と同じ考え)。
 *   保存はブラウザ (compileEndless)。連勝の節目 (MILESTONES) の経験値は帳簿 (xp.js) の key ek:<数> に残るので、実績はそこから数える。
 *   ここは表示も通信もしない (opponent-select.js が入口、main.js が対戦と決着を受け持つ)
 * ========================================================================= */
import { UP } from './runcards.js';
import { STRONGEST_AI } from './aidecks.js';

const KEY = 'compileEndless';
export const ENDLESS_LEVEL = 3;        // 相手の CPU の強さ (GATEKEEPER)

/* 連勝の数ごとに足すルール (index = 今の連勝の数で、それより前のものも全部かかる)。
   ボスの手札・Ω・先攻・強化・コントロールは、どれも勝ち抜き戦の HEAT とボスで使っている部品 (run.js の battleOpts) */
export const STAGES = [
  null,
  { id: 'hand6', text: 'GATEKEEPER のはじめの手札が 6 枚' },
  { id: 'omega1', text: 'GATEKEEPER の山札に Ω カード (WATER) が1枚入る' },
  { id: 'first', text: 'GATEKEEPER がいつも先攻' },
  { id: 'upgrade', text: 'GATEKEEPER のカードが全部 強化済み (値 +1)' },
  { id: 'hand7', text: 'GATEKEEPER のはじめの手札が 7 枚、Ω カード (SPEED) がもう1枚入る' },
  { id: 'control', text: 'GATEKEEPER がはじめからコントロールを持つ' }
];
export const MAX_STAGE = STAGES.length - 1;

/* 節目の経験値 (連勝の数ごとに初回だけ)。実績 (achievements.js) もこの帳簿で数える */
export const MILESTONES = { 3: 10, 5: 15, 7: 20, 10: 20 };
export const milestoneKey = (n) => 'ek:' + n;

/** いまの連勝の数でかかるルール (文の並び) */
export function activeRules(streak) {
  return STAGES.slice(1, Math.min(MAX_STAGE, Math.max(0, streak | 0)) + 1).map(s => s.text);
}
/** 連勝が streak になったときに新しく足されるルール (足すものが無ければ null)。次に勝ったら足されるのは ruleAt(streak + 1) */
export function ruleAt(streak) {
  const s = (streak | 0) >= 1 ? STAGES[streak | 0] : null;
  return s ? s.text : null;
}

/** 試合のはじめ方 (engine の newGame に足す)。me = 自分の席 */
export function endlessOpts(streak, me) {
  const other = 1 - me;
  const on = new Set(STAGES.slice(1, Math.min(MAX_STAGE, Math.max(0, streak | 0)) + 1).map(s => s.id));
  if (!on.size) return null;
  const hand = [5, 5];
  if (on.has('hand6')) hand[other] = 6;
  if (on.has('hand7')) hand[other] = 7;
  const add = [];
  if (on.has('omega1')) add.push('XO_1');
  if (on.has('hand7')) add.push('XO_2');
  const swap = {};
  /* 値 6 は ＋ が無いので engine がそのまま使う (勝ち抜き戦のボスと同じ) */
  if (on.has('upgrade')) for (const n of STRONGEST_AI) for (let k = 1; k <= 6; k++) swap[n + '_' + k] = n + '_' + k + UP;
  const deckMods = [{}, {}];
  deckMods[other] = { swap, add };
  return {
    handSize: hand,
    ...(add.length || Object.keys(swap).length ? { deckMods } : {}),
    ...(on.has('first') ? { first: other } : {}),
    ...(on.has('control') ? { startControl: other } : {})
  };
}

/* ---------- 挑戦の状態 (localStorage) ----------
   { v, streak, best, phase: 'idle' | 'battle', retried: この段をやり直したか, last: 最後に勝った・負けた3つ, bestDeck } */
function blank() { return { v: 1, streak: 0, best: 0, phase: 'idle', retried: false, last: null, bestDeck: null }; }
export function loadEndless() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || s.v !== 1) return blank();
    return { ...blank(), ...s, streak: Math.max(0, s.streak | 0), best: Math.max(0, s.best | 0, s.streak | 0) };
  } catch (e) {
    return blank();
  }
}
export function saveEndless(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

/** 入口を開いたとき: 対戦中のまま閉じていたら、1回目はやり直し、2回目は負け。{ state, note } */
export function reopen(s) {
  if (s.phase !== 'battle') return { state: s, note: null };
  if (!s.retried) return { state: { ...s, phase: 'idle', retried: true }, note: '前の対戦は途中で終わっていました。この1戦だけ、同じ連勝のままもう一度挑めます' };
  return { state: { ...lose(s), phase: 'idle' }, note: '対戦の途中で2回終わったので、連勝はここまでになりました' };
}

/** 対戦を始める */
export function startMatch(s) { return { ...s, phase: 'battle' }; }

function lose(s) { return { ...s, streak: 0, phase: 'idle', retried: false }; }

/** 決着。deck = 自分の3つ。{ state, milestone: 届いた節目の数 or null } */
export function finishMatch(s, win, deck) {
  if (s.phase !== 'battle') return { state: s, milestone: null };
  if (!win) return { state: { ...lose(s), last: deck ? deck.slice() : null }, milestone: null };
  const streak = s.streak + 1;
  const best = Math.max(s.best, streak);
  return {
    state: { ...s, streak, best, phase: 'idle', retried: false, last: deck ? deck.slice() : null, bestDeck: streak >= s.best && deck ? deck.slice() : s.bestDeck },
    milestone: MILESTONES[streak] ? streak : null
  };
}

/** 帳簿の節目から、いちばん長い連勝 (実績用。別の端末の分も帳簿で入る) */
export function bestFromLedger(log) {
  let best = 0;
  for (const e of log || []) {
    const m = /^k:ek:(\d+)$/.exec(e.id || '');
    if (m) best = Math.max(best, +m[1]);
  }
  return best;
}
