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
  { lv: 9, kind: 'marker', key: 'crystal', name: 'CONTROL MARKER — CRYSTAL' },
  { lv: 10, kind: 'mat', key: 'biomech', name: 'PLAYMAT — BIOMECH' },
  { lv: 10, kind: 'title', key: 'veteran', name: 'TITLE — VETERAN' },
  { lv: 11, kind: 'ccolor', key: 'cyan', name: 'COMPILE FX — CYAN' },
  { lv: 12, kind: 'victory', key: 'aurora', name: 'VICTORY FX — AURORA' },
  { lv: 13, kind: 'sleeve', key: 'void', name: 'SLEEVE — VOID' },
  { lv: 14, kind: 'title', key: 'tactician', name: 'TITLE — TACTICIAN' },
  { lv: 15, kind: 'sleeve', key: 'holo', name: 'SLEEVE — HOLO' },
  { lv: 15, kind: 'title', key: 'expert', name: 'TITLE — EXPERT' },
  { lv: 16, kind: 'marker', key: 'crimson', name: 'CONTROL MARKER — CRIMSON' },
  { lv: 17, kind: 'ccolor', key: 'rainbow', name: 'COMPILE FX — RAINBOW' },
  { lv: 18, kind: 'sleeve', key: 'sakura', name: 'SLEEVE — SAKURA' },
  { lv: 19, kind: 'title', key: 'architect', name: 'TITLE — ARCHITECT' },
  { lv: 20, kind: 'mat', key: 'prism', name: 'PLAYMAT — PRISM' },
  { lv: 20, kind: 'title', key: 'master', name: 'TITLE — MASTER' },
  { lv: 22, kind: 'mat', key: 'eclipse', name: 'PLAYMAT — ECLIPSE' },
  { lv: 24, kind: 'marker', key: 'prism', name: 'CONTROL MARKER — PRISM' },
  { lv: 25, kind: 'title', key: 'legend', name: 'TITLE — LEGEND' },
  { lv: 27, kind: 'sleeve', key: 'aurum', name: 'SLEEVE — AURUM' },
  { lv: 30, kind: 'title', key: 'ascended', name: 'TITLE — ASCENDED' }
];

/* 見た目の選択肢 (default ははじめから)。名前は設定の画面に出す */
export const COSMETICS = {
  mat: [['neon', 'NEON GRID'], ['nebula', 'NEBULA'], ['vortex', 'VORTEX'], ['biomech', 'BIOMECH'], ['prism', 'PRISM'], ['eclipse', 'ECLIPSE']],
  sleeve: [['default', 'STANDARD'], ['crimson', 'CRIMSON'], ['circuit', 'CIRCUIT'], ['void', 'VOID'], ['holo', 'HOLO'], ['sakura', 'SAKURA'], ['aurum', 'AURUM']],
  marker: [['default', 'STANDARD'], ['gold', 'GOLD'], ['crystal', 'CRYSTAL'], ['crimson', 'CRIMSON'], ['prism', 'PRISM']],
  ccolor: [['default', 'PROTOCOL'], ['gold', 'GOLD'], ['cyan', 'CYAN'], ['rainbow', 'RAINBOW']],
  victory: [['default', 'STANDARD'], ['aurora', 'AURORA']]
};

/* 称号 (レベルのもの + 条件で取るもの)。オンラインで相手に見せるので、サーバー (secure-room の BADGES) にも同じ key を並べる */
export const TITLES = {
  compiler: 'COMPILER', veteran: 'VETERAN', tactician: 'TACTICIAN', expert: 'EXPERT', architect: 'ARCHITECT',
  master: 'MASTER', legend: 'LEGEND', ascended: 'ASCENDED', underdog: 'UNDERDOG',
  /* 実績で取る (cosmetics-ui.js の TROPHY_TITLES) */
  chainer: 'CHAIN MASTER', flawless: 'FLAWLESS', grandmaster: 'GRANDMASTER',
  puzzler: 'PUZZLER', compuzzler: 'COMPUZZLER',       // COMPUZZLE の中級を全部 / 全部
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
