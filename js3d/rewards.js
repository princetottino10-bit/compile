/* =========================================================================
 * レベルアップの報酬 (見た目と記念だけ。強さは変わらない)
 *   kind: mat (盤面) / sleeve (カードの裏面) / marker (コントロールマーカー) / ccolor (自分のコンパイルの光)
 *         victory (勝ちの演出) / title (称号) / icon (アイコンを選べる)
 *   選ぶのは設定の「見た目」(cosmetics-ui.js)。レベルは stats-data.js の playerLevel
 * ========================================================================= */

export const REWARDS = [
  { lv: 2, kind: 'sleeve', key: 'crimson', name: 'SLEEVE — CRIMSON' },
  { lv: 3, kind: 'mat', key: 'nebula', name: 'PLAYMAT — NEBULA' },
  { lv: 4, kind: 'marker', key: 'gold', name: 'CONTROL MARKER — GOLD' },
  { lv: 5, kind: 'title', key: 'compiler', name: 'TITLE — COMPILER' },
  { lv: 5, kind: 'icon', key: 'icon', name: 'PROFILE ICON' },
  { lv: 6, kind: 'mat', key: 'vortex', name: 'PLAYMAT — VORTEX' },
  { lv: 7, kind: 'sleeve', key: 'circuit', name: 'SLEEVE — CIRCUIT' },
  { lv: 8, kind: 'ccolor', key: 'gold', name: 'COMPILE FX — GOLD' },
  { lv: 10, kind: 'mat', key: 'biomech', name: 'PLAYMAT — BIOMECH' },
  { lv: 10, kind: 'title', key: 'veteran', name: 'TITLE — VETERAN' },
  { lv: 12, kind: 'victory', key: 'aurora', name: 'VICTORY FX — AURORA' },
  { lv: 15, kind: 'sleeve', key: 'holo', name: 'SLEEVE — HOLO' },
  { lv: 15, kind: 'title', key: 'expert', name: 'TITLE — EXPERT' },
  { lv: 20, kind: 'mat', key: 'prism', name: 'PLAYMAT — PRISM' },
  { lv: 20, kind: 'title', key: 'master', name: 'TITLE — MASTER' }
];

/* 見た目の選択肢 (default ははじめから)。名前は設定の画面に出す */
export const COSMETICS = {
  mat: [['neon', 'NEON GRID'], ['nebula', 'NEBULA'], ['vortex', 'VORTEX'], ['biomech', 'BIOMECH'], ['prism', 'PRISM']],
  sleeve: [['default', 'STANDARD'], ['crimson', 'CRIMSON'], ['circuit', 'CIRCUIT'], ['holo', 'HOLO']],
  marker: [['default', 'STANDARD'], ['gold', 'GOLD']],
  ccolor: [['default', 'PROTOCOL'], ['gold', 'GOLD']],
  victory: [['default', 'STANDARD'], ['aurora', 'AURORA']]
};

/* 称号 (レベルのもの + 条件で取るもの) */
export const TITLES = {
  compiler: 'COMPILER', veteran: 'VETERAN', expert: 'EXPERT', master: 'MASTER', underdog: 'UNDERDOG',
  platinum: 'PLATINUM'     // 実績をすべて取る (achievements.js)
};

/* 全部解放 (管理者のテスト用。ADMIN 画面で切り替え、このブラウザに残す)。見た目と称号だけで、強さは変わらない */
const UNLOCK_KEY = 'compileUnlockAll';
let unlockAll = false;
try { unlockAll = localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { /* node / private mode */ }
export function isUnlockAll() { return unlockAll; }
export function setUnlockAll(on) {
  unlockAll = !!on;
  try { if (unlockAll) localStorage.setItem(UNLOCK_KEY, '1'); else localStorage.removeItem(UNLOCK_KEY); } catch (e) { /* private mode */ }
}

/* その見た目を解放するレベル (はじめからなら 1) */
export function unlockLevel(kind, key) {
  if (unlockAll) return 1;
  const r = REWARDS.find(x => x.kind === kind && x.key === key);
  return r ? r.lv : 1;
}

export function isUnlocked(kind, key, level) {
  return level >= unlockLevel(kind, key);
}

/* from より上 〜 to までのレベルで手に入る報酬 (レベルアップの演出に使う) */
export function rewardsBetween(from, to) {
  return REWARDS.filter(r => r.lv > from && r.lv <= to);
}

/* 次にもらえる報酬 (無ければ null) */
export function nextReward(level) {
  return REWARDS.find(r => r.lv > level) || null;
}

/* 取った称号の key。extra: 条件で取る称号 (下剋上など) */
export function ownedTitles(level, extra) {
  if (unlockAll) return Object.keys(TITLES);
  const own = REWARDS.filter(r => r.kind === 'title' && r.lv <= level).map(r => r.key);
  return own.concat((extra || []).filter(k => TITLES[k] && !own.includes(k)));
}
