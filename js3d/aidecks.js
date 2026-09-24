/* =========================================================================
 * CPU の難易度と固定デッキ
 *   0..2 : かんたん / ふつう / つよい (通常 AI、ランダム編成)
 *   3    : 最強 (dsh 特化 + STRONGEST_AI)
 *   4    : ロック特化 (psylock 特化 + LOCK_AI)
 *   5..  : 挑戦者 (dsh 特化 + CHALLENGERS の固定デッキ)
 *   固定デッキの難易度は「自由に選ぶ」でだけ使える (setup.js)。
 *   エンジンの設定は main.js の applyAiDifficulty、戦績の表示名は stats.js。
 * ========================================================================= */

/* 最強: 2026-09-23 に scripts/deck_search.js で165デッキをふるい分け、
   旧最強 (DARKNESS/SPEED/HATE) と 400戦して 244勝 (61%) */
export const STRONGEST_AI = ['FIRE', 'WATER', 'SPEED'];
/* ロック特化: サイキック①を覆って「相手は裏向きでしかプレイできない」を永続させる。
   ダークネス②で覆われた①を表にするか、スピード③の終了時の移動で①を覆う */
export const LOCK_AI = ['PSYCHIC', 'DARKNESS', 'SPEED'];

/* 挑戦者: 最強を選んだときの上位候補。どれも旧最強と 200戦して互角 (44.5〜49.5%) */
export const CHALLENGER_BASE = 5;
export const CHALLENGERS = [
  { deck: ['DARKNESS', 'SPEED', 'HATE'], name: '旧最強' },
  { deck: ['DARKNESS', 'HATE', 'SMOKE'] },
  { deck: ['HATE', 'FIRE', 'WAR'] },
  { deck: ['SMOKE', 'WATER', 'PEACE'] }
];

export const LEVEL_LABELS = ['かんたん', 'ふつう', 'つよい', '最強', 'ロック特化'];

/* 下剋上: 最弱のデッキ (あなた) で最強 (STRONGEST_AI) に挑む。相手の戦い方は最強と同じ。
   最弱は 2026-09-24 に探したもの: プロトコル単体の強さの下位10個から作れる120デッキを
   scripts/deck_search.js --bottom 10 でふるい分け (SPEED を含むものは最強と重なるので除く)、
   下位8つを最強と60戦ずつ (両者とも最強の戦い方) → SMOKE/UNITY/APATHY が 4勝55敗1分 (6.8%) で最も低い */
export const UNDERDOG_LEVEL = 20;
export const UNDERDOG_DECK = ['SMOKE', 'UNITY', 'APATHY'];

export const isChallenger = (level) => level >= CHALLENGER_BASE && level < CHALLENGER_BASE + CHALLENGERS.length;

/* 難易度の固定デッキ (無ければ null = ランダム編成) */
export function fixedDeck(level) {
  if (level === 3 || level === UNDERDOG_LEVEL) return STRONGEST_AI;
  if (level === 4) return LOCK_AI;
  return isChallenger(level) ? CHALLENGERS[level - CHALLENGER_BASE].deck : null;
}

export function challengerName(c) {
  return (c.name ? c.name + ' ' : '') + c.deck.join(' / ');
}

/* 戦績などに出す難易度の名前 */
export function levelLabel(level) {
  if (isChallenger(level)) return '挑戦者 ' + challengerName(CHALLENGERS[level - CHALLENGER_BASE]);
  if (level === UNDERDOG_LEVEL) return '下剋上 (最弱 vs 最強)';
  return LEVEL_LABELS[level] || '不明';
}
