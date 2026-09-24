/* =========================================================================
 * レベルアップの報酬 (見た目と記念だけ。強さは変わらない)
 *   kind: mat (盤面) / sleeve (カードの裏面) / marker (コントロールマーカー) / ccolor (自分のコンパイルの光)
 *         victory (勝ちの演出) / title (称号) / icon (アイコンを選べる)
 *   選ぶのは設定の「見た目」(cosmetics-ui.js)。レベルは stats-data.js の playerLevel
 * ========================================================================= */

export const REWARDS = [
  { lv: 2, kind: 'sleeve', key: 'crimson', name: 'カードの裏面: CRIMSON' },
  { lv: 3, kind: 'mat', key: 'nebula', name: '盤面: NEBULA' },
  { lv: 4, kind: 'marker', key: 'gold', name: 'コントロールマーカー: GOLD' },
  { lv: 5, kind: 'title', key: 'compiler', name: '称号: コンパイラー' },
  { lv: 5, kind: 'icon', key: 'icon', name: 'アイコン (プロトコルの紋章) を選べる' },
  { lv: 6, kind: 'mat', key: 'vortex', name: '盤面: VORTEX' },
  { lv: 7, kind: 'sleeve', key: 'circuit', name: 'カードの裏面: CIRCUIT' },
  { lv: 8, kind: 'ccolor', key: 'gold', name: 'コンパイルの光: GOLD' },
  { lv: 10, kind: 'mat', key: 'biomech', name: '盤面: BIOMECH' },
  { lv: 10, kind: 'title', key: 'veteran', name: '称号: ベテラン' },
  { lv: 12, kind: 'victory', key: 'aurora', name: '勝ちの演出: AURORA' },
  { lv: 15, kind: 'sleeve', key: 'holo', name: 'カードの裏面: HOLO' },
  { lv: 15, kind: 'title', key: 'expert', name: '称号: エキスパート' },
  { lv: 20, kind: 'mat', key: 'prism', name: '盤面: PRISM' },
  { lv: 20, kind: 'title', key: 'master', name: '称号: マスター' }
];

/* 見た目の選択肢 (default ははじめから)。名前は設定の画面に出す */
export const COSMETICS = {
  mat: [['neon', 'NEON GRID'], ['nebula', 'NEBULA'], ['vortex', 'VORTEX'], ['biomech', 'BIOMECH'], ['prism', 'PRISM']],
  sleeve: [['default', 'STANDARD'], ['crimson', 'CRIMSON'], ['circuit', 'CIRCUIT'], ['holo', 'HOLO']],
  marker: [['default', 'STANDARD'], ['gold', 'GOLD']],
  ccolor: [['default', 'プロトコルの色'], ['gold', 'GOLD']],
  victory: [['default', 'STANDARD'], ['aurora', 'AURORA']]
};

/* 称号 (レベルのもの + 条件で取るもの) */
export const TITLES = {
  compiler: 'コンパイラー', veteran: 'ベテラン', expert: 'エキスパート', master: 'マスター', underdog: '下剋上'
};

/* その見た目を解放するレベル (はじめからなら 1) */
export function unlockLevel(kind, key) {
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
  const own = REWARDS.filter(r => r.kind === 'title' && r.lv <= level).map(r => r.key);
  return own.concat((extra || []).filter(k => TITLES[k] && !own.includes(k)));
}
