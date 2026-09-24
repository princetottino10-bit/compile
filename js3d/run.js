/* =========================================================================
 * 勝ち抜き戦 (ローグライク) の進行と保存。画面は run-ui.js
 *   ・3回のドラフト (3つの候補から1つ) でデッキを作る
 *   ・全8戦。1試合は2本先取。相手は ふつう → つよい → 挑戦者 → 最強 (ボス) と強くなる
 *   ・ライフは勝ち抜き戦を通して持ち越す。相手に1回コンパイルされるたびに 1 減る (リコンパイルも)
 *   ・勝ったら報酬を1つ (プロトコルを入れ替える / ライフを回復 / そのまま)
 *   ・負けたら同じ階をやり直す。ライフが 0 になったら終わり
 *   1戦ごとにページを作り直すので、状態は localStorage に置く
 * ========================================================================= */
import { STRONGEST_AI, CHALLENGERS, CHALLENGER_BASE } from './aidecks.js';

const KEY = 'compileRun';
const BEST_KEY = 'compileRunBest';

export const RUN_LIFE = 5;
export const RUN_HEAL = 2;
/* 勝ち抜き戦の1試合は 2本先取 (通常の3本では1周が長すぎる) */
export const RUN_WIN_COMPILES = 2;
/* 各階の相手。level は aidecks.js の難易度 (1 ふつう / 2 つよい / 3 最強 / 5.. 挑戦者) */
export const FLOORS = [
  { level: 1 }, { level: 1 }, { level: 2 }, { level: 2 }, { level: 2 },
  { challenger: true }, { challenger: true }, { level: 3, boss: true }
];

/* ---------- 保存 ---------- */
export function loadRun() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && r.v === 1 ? r : null;
  } catch (e) {
    return null;
  }
}
export function saveRun(run) {
  try { localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) { /* private mode */ }
}
export function clearRun() {
  try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
}
export function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (e) { return null; }
}
function saveBest(run) {
  const best = loadBest();
  const reached = run.phase === 'clear' ? FLOORS.length + 1 : run.floor + 1;
  if (best && (best.reached > reached || (best.reached === reached && best.life >= run.life))) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ reached, life: Math.max(0, run.life), deck: run.deck, at: Date.now() }));
  } catch (e) { /* private mode */ }
}

/* ---------- 抽選 ---------- */
function sample(list, n, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/* ---------- 進行 (すべて新しい状態を返す) ---------- */
export function newRun(names, rnd = Math.random) {
  return { v: 1, phase: 'draft', deck: [], life: RUN_LIFE, maxLife: RUN_LIFE, floor: 0,
    offers: sample(names, 3, rnd), opp: null, history: [], startedAt: Date.now() };
}

export function draftPick(run, name, names, rnd = Math.random) {
  if (run.phase !== 'draft' || !run.offers.includes(name)) return run;
  const deck = run.deck.concat(name);
  if (deck.length < 3) {
    return { ...run, deck, offers: sample(names.filter(n => !deck.includes(n)), 3, rnd) };
  }
  return prepareFloor({ ...run, deck, offers: [] }, names, rnd);
}

/* その階の相手を決めて、戦う前の状態にする */
export function prepareFloor(run, names, rnd = Math.random) {
  const f = FLOORS[run.floor];
  let opp;
  if (f.boss) opp = { deck: STRONGEST_AI.slice(), level: 3, boss: true };
  else if (f.challenger) {
    const i = Math.floor(rnd() * CHALLENGERS.length);
    opp = { deck: CHALLENGERS[i].deck.slice(), level: CHALLENGER_BASE + i };
  } else {
    opp = { deck: sample(names.filter(n => !run.deck.includes(n)), 3, rnd), level: f.level };
  }
  return { ...run, phase: 'battle', opp, offers: [] };
}

/* 1戦の結果。damage = その試合で相手にコンパイルされた回数 */
export function finishBattle(run, win, damage, names, rnd = Math.random) {
  if (run.phase !== 'battle') return run;
  const life = run.life - damage;
  const history = run.history.concat({ floor: run.floor, win: !!win, damage, opp: run.opp.deck });
  let next;
  if (life <= 0) next = { ...run, life: 0, history, phase: 'over' };
  else if (!win) next = { ...run, life, history };                      // 同じ階をやり直す (相手もそのまま)
  else if (run.floor + 1 >= FLOORS.length) next = { ...run, life, history, floor: run.floor + 1, phase: 'clear' };
  else {
    next = { ...run, life, history, floor: run.floor + 1, phase: 'reward',
      offers: sample(names.filter(n => !run.deck.includes(n)), 3, rnd) };
  }
  if (next.phase === 'over' || next.phase === 'clear') saveBest(next);
  return next;
}

/* 報酬: { type: 'swap', add, remove } / { type: 'heal' } / { type: 'skip' } */
export function applyReward(run, choice, names, rnd = Math.random) {
  if (run.phase !== 'reward') return run;
  let next = run;
  if (choice.type === 'swap' && run.offers.includes(choice.add) && run.deck.includes(choice.remove)) {
    next = { ...run, deck: run.deck.map(n => (n === choice.remove ? choice.add : n)) };
  } else if (choice.type === 'heal') {
    next = { ...run, life: Math.min(run.maxLife, run.life + RUN_HEAL) };
  }
  return prepareFloor(next, names, rnd);
}

/* 試合の記録から、相手 (side) がコンパイルした回数を数える (効果でコンパイル完了にしたものも) */
export function compilesBy(state, side) {
  const tag = 'P' + (side + 1) + ': ';
  return (state && state.actionLog || []).filter(line => {
    const s = String(line);
    return s.startsWith(tag) && (/ライン\d+をコンパイル$/.test(s) || /をコンパイル完了にした/.test(s));
  }).length;
}
