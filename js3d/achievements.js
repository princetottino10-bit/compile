/* =========================================================================
 * 実績 (トロフィー)。銅・銀・金と、ほかを全部取ると PLATINUM。
 *   hidden: 取るまで名前も条件も「???」。取ると経験値 (xp.js、key は ach:id なので2回は入らない)。
 *   判定は2種類:
 *     - 積み上げ: 戦績・経験値の帳簿・お気に入り・レベルからいつでも数え直せる
 *     - その1試合: 決着したときの試合の中身 (game) で見る
 *   取ったものは compileTrophies { id: 取った時刻 } に残す (アカウントの保存 cloudsave.js にも入る)。
 *   ここは表示も通信もしない (achievements-ui.js / main.js が受け持つ)
 * ========================================================================= */
import { CHALLENGER_BASE, CHALLENGERS, UNDERDOG_LEVEL, UNDERDOG_TAG_LEVEL } from './aidecks.js';
const BOSS_LEVELS = [3, 4, ...CHALLENGERS.map((_, i) => CHALLENGER_BASE + i)];
import { XP_GAIN } from './xp.js';
import { protocolSummary, conquered, CONQUER_TOTAL } from './stats-data.js';
import { GACHA_ITEMS } from './rewards.js';

const onlineWin = (e) => e.src === 'online' && e.xp > XP_GAIN.onlinePlay;   // 勝ったときだけ多く入る

const KEY = 'compileTrophies';
export const TROPHY_XP = { bronze: 2, silver: 5, gold: 10, platinum: 20 };

/* ctx: { records: CPU 戦の戦績, xp: 経験値の帳簿, level, cardWins: Map(defId → {wins}),
          game: その1試合 (無ければ null) { win, level, turns, compiles, oppCompiles, winCompiles, effectsMap, faceUpIds, chainMax,
                  refreshes, touched, maxLine, short, at } }
   records は短縮マッチを除いたもの (achievements-ui.js の trophyContext)。
   all は全部の戦績: 積み上げの数 (勝った数・表で出した種類・戦ったプロトコル・習熟度) は、プロフィールや RECORD と同じく
   勝ち抜き戦・週替わりも数える (画面では 100勝・0/180 なのに CENTURY・ARCHIVIST が付かなかった。2026-10-06) */
const every = (c) => c.all || c.records;
const wins = (c) => every(c).filter(r => r.win).length + c.xp.filter(onlineWin).length;
const xpHas = (c, fn) => c.xp.some(fn);
const beat = (c, lv) => c.records.some(r => r.win && r.level === lv);
function streak(records, want) {
  let best = 0, n = 0;
  for (const r of records) { n = !!r.win === want ? n + 1 : 0; best = Math.max(best, n); }
  return best;
}
/* タッグデュエルの勝ち (戦績の mode が tag。下剋上タッグも入る) */
const tagWins = (c) => c.records.filter(r => r.win && r.mode === 'tag');
const playedKinds = (c) => new Set(every(c).flatMap(r => r.cards || [])).size;
const protoWins = (c) => new Set(every(c).filter(r => r.win).flatMap(r => r.me || [])).size;
const tierCards = (c, min) => Array.from(c.cardWins.values()).filter(t => t.wins >= min).length;
/* その1試合。短縮マッチ (RUN・WEEKLY のように3本より少ないコンパイルで決着する試合) は数えない */
const g = (c) => (c.game && !c.game.short ? c.game : null);
/* プロトコルの習熟度のレベル (戦績から) の一覧 */
const masteries = (c) => Array.from(protocolSummary(every(c)).values()).map(t => t.mastery.level);
const bestMastery = (c) => Math.max(0, ...masteries(c));
const playedProtos = (c) => new Set(every(c).flatMap(r => r.me || [])).size;
const hour = (c) => new Date(g(c).at).getHours();
/* COMPUZZLE (詰めコンパイル): 経験値の帳簿の k:ts:t2-03 (問題ごと) と k:dp:日 (今日の問題) で数える。
   問題の数は data/tsume.json と揃える (test/tsume.test.js で確かめる) */
export const TSUME_TOTAL = { 1: 5, 2: 10, 3: 10 };
const tsumeSolved = (c, tiers) => new Set(c.xp.map(e => /^k:ts:t(\d)-\d+$/.exec(e.id || '')).filter(m => m && tiers.includes(+m[1])).map(m => m[0])).size;
const tsumeTotal = (tiers) => tiers.reduce((n, t) => n + TSUME_TOTAL[t], 0);
/* 今日の問題と今日の上級 (解いた日の数。同じ日に両方解いても1日) */
const dailyPuzzles = (c) => new Set(c.xp.map(e => /^k:dph?:(\d+)$/.exec(e.id || '')).filter(Boolean).map(m => m[1])).size;
/* COSMETICS のガチャ (ctx.gacha = gacha.js の loadGacha()) */
const gachaPulls = (c) => (c.gacha && c.gacha.pulls) | 0;
const gachaGot = (c) => Object.keys((c.gacha && c.gacha.owned) || {}).filter(id => GACHA_ITEMS.some(g => g.kind + ':' + g.key === id)).length;
const gachaHasRar = (c, rar) => GACHA_ITEMS.some(g => g.rar === rar && ((c.gacha && c.gacha.owned) || {})[g.kind + ':' + g.key]);

/* progress(c): 積み上げの進み具合 [今, 目標] (出せるものだけ) */
export const TROPHIES = [
  /* ---- 銅 ---- */
  { id: 'first_win', tier: 'bronze', name: 'FIRST BLOOD', desc: '初めて勝つ', test: (c) => wins(c) >= 1 },
  { id: 'wins10', tier: 'bronze', name: 'TEN DOWN', desc: '10勝する', test: (c) => wins(c) >= 10, progress: (c) => [wins(c), 10] },
  { id: 'tutorial', tier: 'bronze', name: 'BOOT SEQUENCE', desc: 'チュートリアルを全部終える', test: (c) => xpHas(c, e => e.id === 'k:tu:all') },
  { id: 'puzzle', tier: 'bronze', name: 'SOLVER', desc: '問題を1つ解く (COMPUZZLE も)', test: (c) => xpHas(c, e => e.src === 'puzzle' || e.src === 'tsume') },
  { id: 'gacha1', tier: 'bronze', name: 'FIRST PULL', desc: 'COLLECTION の GACHA を回す', test: (c) => gachaPulls(c) >= 1 },
  { id: 'daily_puzzle', tier: 'bronze', name: 'PUZZLE OF THE DAY', desc: 'COMPUZZLE の今日の問題を解く', test: (c) => dailyPuzzles(c) >= 1 },
  { id: 'tsume_easy', tier: 'bronze', name: 'WARMED UP', desc: 'COMPUZZLE の初級を全部解く',
    test: (c) => tsumeSolved(c, [1]) >= tsumeTotal([1]), progress: (c) => [tsumeSolved(c, [1]), tsumeTotal([1])] },
  { id: 'daily', tier: 'bronze', name: 'DAILY ROUTINE', desc: 'デイリーミッションを1日で3つそろえる', test: (c) => xpHas(c, e => /^k:dm:\d+:all$/.test(e.id)) },
  { id: 'cards60', tier: 'bronze', name: 'COLLECTOR', desc: '違うカードを60種類、表で出す', test: (c) => playedKinds(c) >= 60, progress: (c) => [Math.min(60, playedKinds(c)), 60] },
  { id: 'explorer', tier: 'bronze', name: 'EXPLORER', desc: '10種類のプロトコルで戦う', test: (c) => playedProtos(c) >= 10, progress: (c) => [Math.min(10, playedProtos(c)), 10] },
  { id: 'bronze_card', tier: 'bronze', name: 'FIRST SHINE', desc: 'カードの縁を銅にする (そのカードで3勝)', test: (c) => tierCards(c, 3) >= 1 },
  { id: 'mastery3', tier: 'bronze', name: 'APPRENTICE', desc: 'どれかのプロトコルの習熟度を3にする', test: (c) => bestMastery(c) >= 3, progress: (c) => [Math.min(3, bestMastery(c)), 3] },
  { id: 'overclock', tier: 'bronze', hidden: true, name: 'OVERCLOCK', desc: '1試合で自分の効果を15回発動させる', test: (c) => !!g(c) && (g(c).effects | 0) >= 15 },
  { id: 'loss5', tier: 'bronze', hidden: true, name: 'NEVER GIVE UP', desc: '5連敗する', test: (c) => streak(c.records, false) >= 5 },
  { id: 'marathon', tier: 'bronze', hidden: true, name: 'MARATHON', desc: '90手番以上かかった試合に勝つ', test: (c) => !!g(c) && g(c).win && g(c).turns >= 90 },
  { id: 'fulldeck', tier: 'bronze', hidden: true, name: 'FULL DECK', desc: '1試合で違うカードを14種類、表で出す', test: (c) => !!g(c) && g(c).faceUpIds.length >= 14 },
  { id: 'nightowl', tier: 'bronze', hidden: true, name: 'NIGHT OWL', desc: '深夜 (0時〜4時) に勝つ', test: (c) => !!g(c) && g(c).win && hour(c) < 4 },
  /* ---- 銀 ---- */
  { id: 'wins50', tier: 'silver', name: 'HALF CENTURY', desc: '50勝する', test: (c) => wins(c) >= 50, progress: (c) => [wins(c), 50] },
  { id: 'strong', tier: 'silver', name: 'STRONG ARM', desc: '「つよい」の CPU に勝つ', test: (c) => beat(c, 2) },
  { id: 'lock', tier: 'silver', name: 'LOCKSMITH', desc: '「ロック特化」の CPU に勝つ', test: (c) => beat(c, 4) },
  { id: 'streak5', tier: 'silver', name: 'ON A ROLL', desc: 'CPU 戦で5連勝する', test: (c) => streak(c.records, true) >= 5, progress: (c) => [Math.min(5, streak(c.records, true)), 5] },
  { id: 'run', tier: 'silver', name: 'RUNNER', desc: 'RUN を全勝クリアする', test: (c) => xpHas(c, e => e.src === 'run') },
  { id: 'weekly', tier: 'silver', name: 'WEEKLY CHAMP', desc: 'WEEKLY をクリアする (専用スリーブ LAUREL)', test: (c) => xpHas(c, e => e.src === 'weekly') },
  { id: 'level10', tier: 'silver', name: 'VETERAN', desc: 'プレイヤーレベル10になる', test: (c) => c.level >= 10, progress: (c) => [Math.min(c.level, 10), 10] },
  { id: 'gold_card', tier: 'silver', name: 'GOLDEN TOUCH', desc: 'カードの縁を金にする (そのカードで25勝)', test: (c) => tierCards(c, 25) >= 1 },
  { id: 'turnfx10', tier: 'silver', name: 'COMBO BURST', desc: '1つの手番に、自分のカードの効果を10回発動させる', test: (c) => !!g(c) && (g(c).turnFxMax | 0) >= 10 },
  { id: 'tsume_mid', tier: 'silver', name: 'PUZZLER', desc: 'COMPUZZLE の中級を全部解く (称号 PUZZLER)',
    test: (c) => tsumeSolved(c, [2]) >= tsumeTotal([2]), progress: (c) => [tsumeSolved(c, [2]), tsumeTotal([2])] },
  { id: 'gacha_legend', tier: 'silver', name: 'LUCKY STAR', desc: 'GACHA で LEGENDARY を引く', test: (c) => gachaHasRar(c, 'L') },
  { id: 'versatile', tier: 'silver', name: 'VERSATILE', desc: '5つのプロトコルの習熟度を3以上にする',
    test: (c) => masteries(c).filter(l => l >= 3).length >= 5, progress: (c) => [Math.min(5, masteries(c).filter(l => l >= 3).length), 5] },
  { id: 'all30play', tier: 'silver', name: 'CARTOGRAPHER', desc: '30のプロトコルすべてで戦う', test: (c) => playedProtos(c) >= 30, progress: (c) => [playedProtos(c), 30] },
  { id: 'edge', tier: 'silver', hidden: true, name: 'ON THE EDGE', desc: '相手があと1回でコンパイルしきるところから勝つ', test: (c) => !!g(c) && g(c).win && g(c).oppCompiles >= g(c).winCompiles - 1 },
  { id: 'speed', tier: 'silver', hidden: true, name: 'SPEEDRUN', desc: '35手番以内 (両者合わせて) で勝つ', test: (c) => !!g(c) && g(c).win && g(c).turns > 0 && g(c).turns <= 35 },
  { id: 'onecard', tier: 'silver', hidden: true, name: 'ONE CARD SHOW', desc: '1試合で同じカードの効果を6回使う', test: (c) => !!g(c) && Object.values(g(c).effectsMap).some(n => n >= 6) },
  /* ---- 金 ---- */
  { id: 'wins100', tier: 'gold', name: 'CENTURY', desc: '100勝する', test: (c) => wins(c) >= 100, progress: (c) => [wins(c), 100] },
  { id: 'apex', tier: 'gold', name: 'APEX', desc: '「最強」の CPU に勝つ', test: (c) => beat(c, 3) },
  /* 強敵 = 相手を選ぶ画面の「強敵」の欄の全員 (最強・ロック特化・挑戦者) */
  { id: 'challengers', tier: 'gold', name: 'GAUNTLET', desc: '強敵を全員倒す',
    test: (c) => BOSS_LEVELS.every(lv => beat(c, lv)),
    progress: (c) => [BOSS_LEVELS.filter(lv => beat(c, lv)).length, BOSS_LEVELS.length] },
  { id: 'underdog', tier: 'gold', name: 'GIANT SLAYER', desc: '下剋上 (最弱 vs 最強) で勝つ', test: (c) => beat(c, UNDERDOG_LEVEL) },
  { id: 'conqueror', tier: 'gold', name: 'CONQUEROR', desc: '「最強」の CPU に、最強のデッキ以外の' + CONQUER_TOTAL + 'のプロトコルすべてで勝つ (称号 CONQUEROR)',
    test: (c) => conquered(c.records).size >= CONQUER_TOTAL, progress: (c) => [Math.min(CONQUER_TOTAL, conquered(c.records).size), CONQUER_TOTAL] },
  { id: 'all30', tier: 'gold', name: 'OMNISCIENT', desc: '30のプロトコルすべてで1勝する', test: (c) => protoWins(c) >= 30, progress: (c) => [protoWins(c), 30] },
  { id: 'holo_card', tier: 'gold', name: 'HOLOGRAM', desc: 'カードをホロにする (そのカードで50勝)', test: (c) => tierCards(c, 50) >= 1 },
  { id: 'level20', tier: 'gold', name: 'MASTER', desc: 'プレイヤーレベル20になる', test: (c) => c.level >= 20, progress: (c) => [Math.min(c.level, 20), 20] },
  { id: 'mastery10', tier: 'gold', name: 'GRANDMASTER', desc: 'どれかのプロトコルの習熟度を最大 (10) にする (称号 GRANDMASTER)',
    test: (c) => bestMastery(c) >= 10, progress: (c) => [bestMastery(c), 10] },
  { id: 'level30', tier: 'gold', name: 'LEGEND', desc: 'プレイヤーレベル30になる', test: (c) => c.level >= 30, progress: (c) => [Math.min(c.level, 30), 30] },
  { id: 'cards180', tier: 'gold', name: 'ARCHIVIST', desc: '180種類すべてのカードを表で出す', test: (c) => playedKinds(c) >= 180, progress: (c) => [Math.min(180, playedKinds(c)), 180] },
  { id: 'tsume_all', tier: 'gold', name: 'COMPUZZLER', desc: 'COMPUZZLE を全部解く (称号 COMPUZZLER)',
    test: (c) => tsumeSolved(c, [1, 2, 3]) >= tsumeTotal([1, 2, 3]), progress: (c) => [tsumeSolved(c, [1, 2, 3]), tsumeTotal([1, 2, 3])] },
  { id: 'gacha_all', tier: 'gold', name: 'COLLECTOR SUPREME', desc: 'GACHA の見た目と称号を全部そろえる',
    test: (c) => gachaGot(c) >= GACHA_ITEMS.length, progress: (c) => [gachaGot(c), GACHA_ITEMS.length] },
  /* ---- 縛りプレイ・記録 (2026-10-04) ---- */
  { id: 'overkill', tier: 'silver', name: 'OVERKILL', desc: '1つのラインの合計値を20以上にする', test: (c) => !!g(c) && (g(c).maxLine | 0) >= 20 },
  { id: 'overclock2', tier: 'silver', name: 'OVERCLOCK II', desc: '1試合で自分の効果を40回発動させる', test: (c) => !!g(c) && (g(c).effects | 0) >= 40 },
  /* 2026-10-08: 20 → 28。3本で決まる試合では、みんなの勝ちのいちばん速いものでも 27 手番で、20 は届かなかった */
  /* 戦績からもさかのぼって見る (条件を緩める前に 28 以内で勝っていた人の分)。CPU 戦・クイックは必ず3本で決まるので、短縮マッチは混ざらない */
  { id: 'blitz', tier: 'silver', hidden: true, name: 'BLITZ', desc: '28手番以内 (両者合わせて) で勝つ',
    test: (c) => (!!g(c) && g(c).win && g(c).turns > 0 && g(c).turns <= 28) ||
      (every(c) || []).some(r => r.win && (r.mode === 'cpu' || r.mode === 'quick') && r.turns > 0 && r.turns <= 28) },
  /* ---- タッグデュエル (2026-10-04) ---- */
  { id: 'tag_win', tier: 'bronze', name: 'TAG TEAM', desc: 'タッグデュエルで勝つ', test: (c) => tagWins(c).length >= 1 },
  { id: 'tag5', tier: 'silver', name: 'PARTNERS', desc: 'タッグデュエルで5勝する', test: (c) => tagWins(c).length >= 5, progress: (c) => [Math.min(5, tagWins(c).length), 5] },
  { id: 'tag_strong', tier: 'silver', name: 'POWER COUPLE', desc: 'タッグデュエルの「つよい」に勝つ', test: (c) => tagWins(c).some(r => r.level === 2) },
  { id: 'tag_all', tier: 'silver', name: 'ALL ROUND', desc: 'タッグデュエルの「かんたん」「ふつう」「つよい」すべてに勝つ (称号 TAG MASTER)',
    test: (c) => [0, 1, 2].every(lv => tagWins(c).some(r => r.level === lv)), progress: (c) => [[0, 1, 2].filter(lv => tagWins(c).some(r => r.level === lv)).length, 3] },
  { id: 'tag_flawless', tier: 'gold', hidden: true, name: 'PERFECT SYNC', desc: 'タッグデュエルで、相手に1回もコンパイルさせずに勝つ (称号 PERFECT SYNC)',
    test: (c) => !!g(c) && g(c).tag && g(c).win && g(c).oppCompiles === 0 },
  { id: 'underdog_tag', tier: 'gold', name: 'UNDERDOG DUO', desc: '下剋上タッグ (かんたんの味方と組んで、最強のタッグ) に勝つ (称号 UNDERDOG DUO)', test: (c) => beat(c, UNDERDOG_TAG_LEVEL) },
  { id: 'norefresh', tier: 'gold', name: 'NO REFRESH', desc: '一度もリフレッシュせずに勝つ', test: (c) => !!g(c) && g(c).win && g(c).refreshes === 0 },
  { id: 'norefresh_apex', tier: 'gold', name: 'NO REFRESH APEX', desc: '一度もリフレッシュせずに「最強」の CPU に勝つ', test: (c) => !!g(c) && g(c).win && g(c).refreshes === 0 && g(c).level === 3 },
  /* 1つの手番にカードの効果を何回も発動させる (チェーン・連鎖で積み上げる)。勝ち負けは問わない */
  { id: 'turnfx15', tier: 'gold', name: 'OVERDRIVE', desc: '1つの手番に、自分のカードの効果を15回発動させる', test: (c) => !!g(c) && (g(c).turnFxMax | 0) >= 15 },
  /* 表で出すのは値 0・1・2 のカードだけで勝つ (3〜6 は裏向きで出すならよい)。前の SHADOW PLAY (一度も表で出さずに勝つ) の代わり */
  { id: 'lowkey', tier: 'gold', name: 'LOW KEY', desc: '表で出すのは 0・1・2 のカードだけで勝つ (3〜6 は裏向きならよい)',
    test: (c) => !!g(c) && g(c).win && Array.isArray(g(c).faceUpVals) && g(c).faceUpVals.length > 0 && g(c).faceUpVals.every(v => v <= 2) },
  { id: 'untouchable', tier: 'gold', name: 'UNTOUCHABLE', desc: '自分のカードを一度も相手の効果で削除・反転・移動・手札に戻されずに勝つ',
    test: (c) => !!g(c) && g(c).win && g(c).touched === 0 },
  { id: 'flawless', tier: 'gold', hidden: true, name: 'FLAWLESS', desc: '相手に1回もコンパイルさせずに勝つ (称号 FLAWLESS)', test: (c) => !!g(c) && g(c).win && g(c).oppCompiles === 0 },
  /* ---- 全部 ---- */
  { id: 'platinum', tier: 'platinum', name: 'PLATINUM', desc: 'ほかの実績をすべて取る (称号 PLATINUM)', test: () => false }
];
const OTHERS = TROPHIES.filter(t => t.id !== 'platinum');

/* 保存の中身そのまま。外した実績は「~id」に外した時刻を置く (同期は両方の端末の実績を合わせるので、
   ただ消すだけだと別の端末やアカウントから戻ってきた)。取り直したら「~id」を 0 にする (合わせるときは小さい方が残る) */
function loadRaw() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) {
    return {};
  }
}
/** 持っている実績 { id: 取った時刻 } (外したものは除く) */
export function loadTrophies() {
  const raw = loadRaw(), out = {};
  for (const [k, v] of Object.entries(raw)) if (k[0] !== '~' && !(raw['~' + k] > 0)) out[k] = v;
  return out;
}
function saveTrophies(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* private mode */ } }

/* まだ取っていない実績のうち、いま条件を満たすもの (純粋な計算)。ほかが全部そろえば platinum も */
export function newlyEarned(have, ctx) {
  const got = OTHERS.filter(t => !have[t.id] && safeTest(t, ctx));
  const all = OTHERS.every(t => have[t.id] || got.includes(t));
  if (all && !have.platinum) got.push(TROPHIES.find(t => t.id === 'platinum'));
  return got;
}
function safeTest(t, ctx) {
  try { return !!t.test(ctx); } catch (e) { return false; }
}

/* 数え方の間違いで付いてしまった実績を外す (積み上げで判定し直せるものだけ)。外したものを返す。
   CONQUEROR: 最強のデッキと同じプロトコルまで数えていて、27 に届いていないのに付いた (2026-10-04) */
const RECHECK = ['conqueror'];
export function pruneTrophies(ctx) {
  const have = loadTrophies();
  const wrong = RECHECK.filter(id => have[id] && !safeTest(TROPHIES.find(t => t.id === id), ctx));
  if (wrong.length) {
    const raw = loadRaw(), now = Date.now();
    for (const id of wrong) raw['~' + id] = now;
    if (raw.platinum) raw['~platinum'] = now;
    saveTrophies(raw);
  }
  return wrong;
}

/* 判定して、取った分を保存する。今回取った実績を返す */
export function unlockTrophies(ctx, now = Date.now()) {
  const have = loadTrophies();
  const got = newlyEarned(have, ctx);
  if (got.length) {
    const raw = loadRaw();
    for (const t of got) { raw[t.id] = raw[t.id] ? Math.min(raw[t.id], now) : now; if ('~' + t.id in raw) raw['~' + t.id] = 0; }
    saveTrophies(raw);
  }
  return got;
}

/* 表示用: [{ ...実績, at: 取った時刻 or null, progress: [今, 目標] or null }] と達成率 */
export function trophyView(ctx) {
  const have = loadTrophies();
  const list = TROPHIES.map(t => ({ ...t, at: have[t.id] || null, prog: !have[t.id] && t.progress ? safeProgress(t, ctx) : null }));
  const done = list.filter(t => t.at).length;
  return { list, done, total: list.length, rate: Math.round(100 * done / list.length) };
}
function safeProgress(t, ctx) {
  try { return t.progress(ctx); } catch (e) { return null; }
}

export function hasPlatinum() { return !!loadTrophies().platinum; }
