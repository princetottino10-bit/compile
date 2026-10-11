/* =========================================================================
 * CPU の難易度と固定デッキ
 *   0..2 : かんたん / ふつう / つよい (通常 AI、ランダム編成)
 *   3    : 最強 (dsh 特化 + STRONGEST_AI)
 *   4    : ロック特化 (psylock 特化 + LOCK_AI)
 *   5..  : 挑戦者 (dsh 特化 + CHALLENGERS の固定デッキ)
 *   22   : 機械仕掛けの神 CODE:PURPLE (psylock 特化 + DEUS_AI、4 秒の読み。対戦の始めに降臨の演出)
 *   23   : すべてを見る者 ALL-SEEING (22 と同じ + のぞき見。神に勝つと現れる。対戦の始めに目が開く演出)
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

/* 下剋上タッグ: あなた (最弱で固定) と、かんたんの CPU の味方 vs 最強のタッグ。
   相手は最強のデッキ (STRONGEST_AI) と、DARKNESS / HATE / PSYCHIC (最強とも、あなたの最弱とも重ならない。2026-10-04)。
   相手2人とも最強と同じ戦い方。味方の CPU だけ、かんたんの読み (main.js の UNDERDOG_MATE_AI) */
export const UNDERDOG_TAG_LEVEL = 21;
export const UNDERDOG_TAG_RIVAL_MATE = ['DARKNESS', 'HATE', 'PSYCHIC'];

/* 機械仕掛けの神 (仮の名前 CODE:PURPLE): ぱぱぱのぱの棋譜から学んだ指し方 (ロック特化がもと) と、その得意デッキ。
   CHALLENGE の画面にだけ出す (週替わり・勝ち抜き戦の CHALLENGERS には入れない)。対戦の始めにデウス・エクス・マキナの降臨 (deus.js) */
export const DEUS_LEVEL = 22;
/* デッキ: 3つ目を10通り試し (2026-10-11)、最強 (1.2 秒) 相手に 4 秒の読みで 480戦 55.7% (95%: 51.3〜60.1%) だった FIRE。
   ぱぱぱのぱの得意は WAR だが、WAR は 47% で最強に届かなかった */
export const DEUS_AI = ['PSYCHIC', 'DARKNESS', 'FIRE'];
/* 考える時間 (ms)。最強は 1200。読みを深くした分だけ強い (0.9 秒で 42% → 2.4 秒で 47%、WAR のとき) */
export const DEUS_BUDGET = 4000;
/* ALL-SEEING (機械仕掛けの神の先、のぞき見の敵): 神と同じ読み・デッキに、こちらの手札・裏向き・山札の並びをすべて見る力。
   最強 (1.2 秒) 相手に 480戦 66.5% (神は 54.6%)。神に勝つと CHALLENGE に現れる */
export const PEEK_LEVEL = 23;
export const PEEK_AI = ['PSYCHIC', 'DARKNESS', 'FIRE'];
export const PEEK_NAME = 'ALL-SEEING';
export const DEUS_NAME = 'CODE:PURPLE';

export const isChallenger = (level) => level >= CHALLENGER_BASE && level < CHALLENGER_BASE + CHALLENGERS.length;

/* 難易度の固定デッキ (無ければ null = ランダム編成) */
export function fixedDeck(level) {
  if (level === 3 || level === UNDERDOG_LEVEL || level === UNDERDOG_TAG_LEVEL) return STRONGEST_AI;
  if (level === 4) return LOCK_AI;
  if (level === DEUS_LEVEL) return DEUS_AI;
  if (level === PEEK_LEVEL) return PEEK_AI;
  return isChallenger(level) ? CHALLENGERS[level - CHALLENGER_BASE].deck : null;
}

export function challengerName(c) {
  return (c.name ? c.name + ' ' : '') + c.deck.join(' / ');
}

/* 戦績などに出す難易度の名前 */
export function levelLabel(level) {
  if (isChallenger(level)) return '挑戦者 ' + challengerName(CHALLENGERS[level - CHALLENGER_BASE]);
  if (level === UNDERDOG_LEVEL) return '下剋上 (最弱 vs 最強)';
  if (level === DEUS_LEVEL) return '機械仕掛けの神 ' + DEUS_NAME;
  if (level === PEEK_LEVEL) return 'すべてを見る者 ' + PEEK_NAME;
  if (level === UNDERDOG_TAG_LEVEL) return '下剋上タッグ (かんたんの味方 vs 最強タッグ)';
  return LEVEL_LABELS[level] || '不明';
}
