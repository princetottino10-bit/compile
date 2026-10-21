/* =========================================================================
 * ストーリーの★3 (クリアした対戦を、条件つきでもう一度遊ぶ理由)
 *   対戦の場面ごとに★を3つ。★1 は勝つ (クリア)、★2 は手番の数、★3 はその1戦ごとの条件。
 *   取った★は経験値の帳簿 (xp.js) に key ss:<場面の id>:<1-3> で残す。帳簿はアカウントの保存にも載るので、
 *   別の保存を持たずに端末をまたいで同じ★になり、同じ★の経験値は2回入らない。
 *   ★1 は帳簿に無くても、クリアしていれば付いている扱い (★3 を入れる前にクリアした人の分)。
 *   「かんたんで挑む」で勝ったときは ★1 だけ (★2・★3 は場面の強さで勝ったときだけ)。
 *   手番の数は自分の手番だけを数える。ストーリーはいつも自分が先攻なので、両者合わせた手番の数の半分 (切り上げ)。
 *   目安 (2026-10-21、scratch の試算。CPU 同士 60戦ずつ): ★2 の手番は、主人公を「つよい」で指させたときの真ん中くらい。
 *   ★3 は「つよい」でも半分前後、「かんたん」(3割でたらめ) だと 1〜3割しか届かないもの。
 *   試算の値 (つよい / かんたん): c0-practice 中央 15 / 21 手番 (両者合計)・相手0回 73% / 31%、c0-chief 27 / 31・1回以下 62% / 44%、
 *   c1-abyss 23 / 27・リフレッシュなし 30% / 33%、c2-akane 43 / 49・1回以下 58% / 11%、c2-clock 25 / 31・相手0回 43% / 13%
 *   ここは表示も通信もしない (story-ui.js・story-world.js・main.js が受け持つ)
 * ========================================================================= */
import { CHAPTERS, isCleared } from './story.js';

/* 条件の種類。test(game) は main.js の gameSummary の中身で見る */
const KINDS = {
  turns: { text: (n) => '自分の手番 ' + n + ' 回以内に勝つ', test: (g, n) => Math.ceil((g.turns | 0) / 2) <= n },
  oppMax: { text: (n) => (n === 0 ? '相手に1回もコンパイルさせずに勝つ' : '相手のコンパイルを ' + n + ' 回以下に抑えて勝つ'), test: (g, n) => (g.oppCompiles | 0) <= n },
  noRefresh: { text: () => '一度もリフレッシュせずに勝つ', test: (g) => (g.refreshes | 0) === 0 }
};

/* 場面ごとの ★2・★3。対戦の場面 (battle) はすべてここに置く (test/story-stars.test.js が確かめる)。
   一度出した条件は変えない (取った★の意味が変わる。直すなら場面を足すときに新しく決める) */
export const STAR_RULES = {
  'c0-practice': [{ k: 'turns', n: 8 }, { k: 'oppMax', n: 0 }],
  'c0-chief': [{ k: 'turns', n: 14 }, { k: 'oppMax', n: 1 }],
  'c1-abyss': [{ k: 'turns', n: 12 }, { k: 'noRefresh' }],
  'c2-akane': [{ k: 'turns', n: 22 }, { k: 'oppMax', n: 1 }],
  'c2-clock': [{ k: 'turns', n: 13 }, { k: 'oppMax', n: 0 }]
};

export const STAR_XP = 2;          // ★1つにつき (場面ごとに初回)
export const starKey = (id, i) => 'ss:' + id + ':' + i;
const ledgerId = (id, i) => 'k:' + starKey(id, i);

/** ★のある場面 (章の順) */
export const starNodes = () => CHAPTERS.flatMap(c => c.nodes.filter(n => n.kind === 'battle' && STAR_RULES[n.id]).map(n => ({ ...n, chapter: c.id })));

/** その場面の★3つの文 */
export function starTexts(id) {
  const r = STAR_RULES[id];
  if (!r) return [];
  return ['勝つ'].concat(r.map(x => KINDS[x.k].text(x.n)));
}

/** その1戦で届いた★ [★1, ★2, ★3]。easy: 「かんたんで挑む」で勝った */
export function judgeStars(id, game, easy) {
  const r = STAR_RULES[id];
  if (!r || !game || !game.win) return [false, false, false];
  if (easy) return [true, false, false];
  return [true].concat(r.map(x => !!KINDS[x.k].test(game, x.n)));
}

/** 取った★ [★1, ★2, ★3]。log = 経験値の帳簿 (xp.js の xpLog())、story = 進み具合 (無ければ帳簿だけで見る) */
export function earnedStars(id, log, story) {
  const ids = new Set((log || []).map(e => e.id));
  return [1, 2, 3].map(i => ids.has(ledgerId(id, i)) || (i === 1 && !!story && isCleared(story, id)));
}

/** 全部でいくつ取ったか { got, total } */
export function starTotals(log, story) {
  const nodes = starNodes();
  const got = nodes.reduce((n, x) => n + earnedStars(x.id, log, story).filter(Boolean).length, 0);
  return { got, total: nodes.length * 3 };
}
