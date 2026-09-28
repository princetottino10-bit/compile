/* =========================================================================
 * 勝ち抜き戦 (ローグライク。Slay the Spire のような地図を登る形) の進行と保存。画面は run-ui.js
 *   ・3回のドラフト (3つの候補から1つ) でデッキを作り、はじめのパッチを1つ選ぶ
 *   ・地図は下から上へ 12 段。最初から全部見えていて、つながっている道を1段ずつ選んで登る
 *       ⚔ 戦闘 / ☠ 精鋭 (強い。勝つとパッチ) / ? イベント / ✚ 休憩所 (回復かカード除去) /
 *       $ ショップ (パッチ・カード除去・回復・GACHA) / ◆ 宝箱 (パッチ) / ♛ BOSS (最上段)
 *   ・1試合は2本先取 (序盤の1〜2段目のふつうの戦闘は1本先取)。ライフは勝ち抜き戦を通して持ち越し、相手に1回コンパイルされるたびに 1 減る
 *   ・負けたら同じ相手とやり直し。ライフが 0 になったら終わり
 *   ・勝つとクレジットと、プロトコルの入れ替え (取らなくてもよい)
 *   ・カード除去: デッキから1枚ずつ外して、欲しいカードが来やすくする (最大 6 枚)
 *   ・パッチ (勝ち抜き戦のあいだ効き続ける改造) には系統 (HAND / GUARD / GREED / TEMPO) があり、
 *     同じ系統を 2つ・3つ集めるとボーナス (ビルド)
 *   ・強化 (＋): デッキのカードを1枚ずつ値 +1 に (休憩所・ショップ・イベント)。run.upgrades に元の id
 *   ・★ カード: 勝ち抜き戦だけのオリジナルカード (runcards.js) を山札に足す (ショップ・イベント)。run.added
 *   ・クリアすると次の HEAT (難しさ) が解放される (最大 5。上の段は下の段の条件を全部含む)
 *   1戦ごとにページを作り直すので、状態は localStorage に置く
 * ========================================================================= */
import { STRONGEST_AI, CHALLENGERS, CHALLENGER_BASE } from './aidecks.js';
import { UP, isStar, baseOf, starOf, STAR_CARDS } from './runcards.js';

const KEY = 'compileRun';
const BEST_KEY = 'compileRunBest';
const HEAT_KEY = 'compileRunHeat';
const VERSION = 2;

/* 2026-09-25 の見直し: 勝っても1回はコンパイルされがち (勝ちで平均 −1、負けで −2) で、BOSS まで約 8 戦。
   ライフ 5 だと ふつうの CPU と互角の人のクリアが 1 割ほどだったので 10 に (同じ見積もりで 3〜5 割) */
export const RUN_LIFE = 10;
export const RUN_HEAL = 3;
export const HEAT_LIFE = 3;                 // HEAT 1 からのライフの減り
/* 勝ち抜き戦の1試合は 2本先取 (通常の3本では1周が長すぎる) */
export const RUN_WIN_COMPILES = 2;
export const MAP_ROWS = 12;                 // 最上段が BOSS
/* 序盤はさっさと勝てるように (2026-09-28): 1〜2段目のふつうの戦闘は1本先取、1〜3段目の相手は「かんたん」 */
export const QUICK_ROWS = 2;
export const EASY_ROWS = 3;
/** その試合の本数 (序盤のふつうの戦闘だけ1本先取) */
export function runWinCompiles(run) {
  const node = nodeById(run, run.pos);
  const plain = !run.opp || (!run.opp.boss && !run.opp.elite && run.route !== 'alarm' && run.route !== 'cursed');
  return node && node.row < QUICK_ROWS && plain ? 1 : RUN_WIN_COMPILES;
}
export const MAX_REMOVED = 6;               // 山札を 12 枚より減らさない
export const START_CREDITS = 4;

/* ---------- BOSS ----------
   プロトコル3つの組み合わせがモチーフのボス。勝ち抜き戦ごとに1体 (run.boss)。地図の最初から見える。
   rule はボスだけの試合のルール: bossHand / meHand (はじめの手札)・bossFirst (いつも先攻)・bossControl (はじめからコントロール)・
   upgradeAll (ボスのカードは全部 ＋)・stars (ボスの山札に足す ★)・win: [あなた, ボス] (勝ちに要るコンパイル)
   HEAT 5 は「最強」 (いちばん強い CPU のデッキ) */
export const BOSSES = [
  { id: 'inferno', name: '業火の王', title: '焼き尽くす者', deck: ['FIRE', 'HATE', 'WAR'], color: '#ff5a3c',
    text: 'ボスのカードは全部 強化済み (値 +1)', rule: { upgradeAll: true } },
  { id: 'abyss', name: '深淵の主', title: '底なしの闇', deck: ['DARKNESS', 'DEATH', 'PLAGUE'], color: '#8a4dff',
    text: 'ボスのはじめの手札は 7 枚', rule: { bossHand: 7 } },
  { id: 'clock', name: '時計塔の番人', title: '刻を統べる者', deck: ['TIME', 'SPEED', 'CLARITY'], color: '#ffc85a',
    text: 'ボスがいつも先攻で、はじめからコントロールを持つ', rule: { bossFirst: true, bossControl: true } },
  { id: 'mirror', name: '鏡の迷宮', title: '惑わす者', deck: ['MIRROR', 'CHAOS', 'LUCK'], color: '#7cf0ff',
    text: 'あなたのはじめの手札は 4 枚', rule: { meHand: 4 } },
  { id: 'sanctuary', name: '聖域の守り手', title: '揺るがぬ者', deck: ['LIGHT', 'LIFE', 'PEACE'], color: '#fff2a8',
    text: 'あなたは 3 本、ボスは 2 本コンパイルで勝ち', rule: { win: [3, 2] } },
  { id: 'glacier', name: '氷結の女帝', title: '凍てつく者', deck: ['ICE', 'WATER', 'METAL'], color: '#9fd8ff',
    text: 'ボスの山札に WATER ★ と、強化した WATER ★ が入る', rule: { stars: ['X_WATER', 'X_WATER' + UP] } }
];
export const FINAL_BOSS = { id: 'strongest', name: '最強', title: '頂に立つ者', deck: STRONGEST_AI.slice(), color: '#ff4fa3',
  text: 'いちばん強い CPU。ボスのカードは全部 強化済み、はじめの手札は 6 枚', rule: { upgradeAll: true, bossHand: 6 } };
export const bossOf = (run) => (run && run.boss === FINAL_BOSS.id ? FINAL_BOSS : BOSSES.find(b => b.id === (run && run.boss)) || FINAL_BOSS);
function chooseBoss(heat, rnd) {
  return heat >= 5 ? FINAL_BOSS.id : BOSSES[Math.floor(rnd() * BOSSES.length)].id;
}

/* 地図のマス */
export const NODES = {
  battle: { icon: '⚔', name: '戦闘', text: 'いつもの相手。勝てばクレジットと報酬' },
  elite: { icon: '☠', name: '精鋭', text: '強い相手。勝てばクレジット多めと、パッチを1つ' },
  event: { icon: '?', name: 'イベント', text: '何かが起きる' },
  rest: { icon: '✚', name: '休憩所', text: 'ライフを 3 回復するか、カードを1枚外す' },
  shop: { icon: '$', name: 'ショップ', text: 'クレジットでパッチ・カード除去・回復・GACHA' },
  treasure: { icon: '◆', name: '宝箱', text: 'パッチを3つから1つ' },
  boss: { icon: '♛', name: 'BOSS', text: '最強の CPU。倒せばクリア' }
};

/* パッチ。tag: ビルドの系統 / kind: life (ライフ・報酬に効く) / game (試合のはじめ方を変える) / rar: レア度 (C / R / E / L) */
export const PATCHES = [
  { id: 'battery', tag: 'GUARD', kind: 'life', rar: 'R', name: 'BACKUP BATTERY', text: '最大ライフ +2 (いまのライフも +2)' },
  { id: 'repair', tag: 'TEMPO', kind: 'life', rar: 'C', name: 'SELF REPAIR', text: '勝つたびにライフ +1' },
  { id: 'firewall', tag: 'GUARD', kind: 'life', rar: 'R', name: 'FIREWALL', text: '各試合、最初にコンパイルされた1回はライフが減らない' },
  { id: 'failsafe', tag: 'GUARD', kind: 'life', rar: 'E', name: 'FAILSAFE', text: 'ライフが尽きる試合を1度だけ、ライフ 1 で耐える' },
  { id: 'sweep', tag: 'TEMPO', kind: 'life', rar: 'C', name: 'CLEAN SWEEP', text: '1回もコンパイルされずに勝つとライフ +2' },
  { id: 'search', tag: 'GREED', kind: 'life', rar: 'C', name: 'DEEP SEARCH', text: '報酬のプロトコルの候補が 4 つになる' },
  { id: 'lucky', tag: 'GREED', kind: 'life', rar: 'C', name: 'LUCKY COIN', text: 'GACHA とショップが 1 クレジット安くなる' },
  { id: 'jackpot', tag: 'GREED', kind: 'life', rar: 'E', name: 'JACKPOT', text: '勝つたびにクレジット +2' },
  { id: 'initiative', tag: 'TEMPO', kind: 'game', rar: 'R', name: 'INITIATIVE', text: 'いつも先攻' },
  { id: 'cache', tag: 'HAND', kind: 'game', rar: 'R', name: 'EXTRA CACHE', text: 'はじめの手札 +1' },
  { id: 'buffer', tag: 'HAND', kind: 'game', rar: 'C', name: 'PREFETCH', text: 'はじめの手札 +1 (EXTRA CACHE と重なる)' },
  { id: 'root', tag: 'TEMPO', kind: 'game', rar: 'E', name: 'ROOT ACCESS', text: '試合のはじめからコントロールを持つ' },
  { id: 'jammer', tag: 'HAND', kind: 'game', rar: 'C', name: 'JAMMER', text: '相手のはじめの手札が 4 枚' },
  /* LEGENDARY: ガチャとショップだけ (はじめのパッチ・精鋭・宝箱には出ない) */
  { id: 'overflow', tag: 'HAND', kind: 'game', rar: 'L', gachaOnly: true, name: 'OVERFLOW', text: 'はじめの手札が 7 枚' },
  { id: 'singularity', tag: 'HAND', kind: 'game', rar: 'L', gachaOnly: true, name: 'SINGULARITY', text: '相手のはじめの手札が 3 枚' },
  { id: 'phoenix', tag: 'GUARD', kind: 'life', rar: 'L', gachaOnly: true, name: 'PHOENIX', text: 'ライフが尽きたら1度だけ、ライフ全回復でよみがえる' },
  { id: 'midas', tag: 'GREED', kind: 'life', rar: 'L', gachaOnly: true, name: 'MIDAS TOUCH', text: 'もらえるクレジットが 2 倍' },
  /* RISK: 強い効果と、はっきりした代償がセット (cost に代償) */
  { id: 'nocost', tag: 'RISK', kind: 'game', rar: 'E', name: 'NO COST', text: '自分のカードの効果で手札を捨てるとき、捨てなくてよい (捨てたことになる)', cost: 'はじめの手札 −2' },
  { id: 'double', tag: 'RISK', kind: 'game', rar: 'E', name: 'DOUBLE DOWN', text: 'デッキの1つ目のプロトコルの、表向きの値が 2 倍', cost: 'ほかの2つのプロトコルの、表向きの値 −1' },
  { id: 'shadow', tag: 'RISK', kind: 'game', rar: 'R', name: 'SHADOW RULE', text: '裏向きのカードの値が 4', cost: '表向きのカードの値が全部 −1' },
  { id: 'oneshot', tag: 'RISK', kind: 'game', rar: 'L', name: 'ONE SHOT', text: '1本コンパイルしたら勝ち', cost: '最大ライフが半分' },
  { id: 'gluttony', tag: 'RISK', kind: 'game', rar: 'R', name: 'GLUTTONY', text: 'はじめの手札が 7 枚', cost: '相手のはじめの手札も 7 枚' },
  { id: 'allin', tag: 'RISK', kind: 'life', rar: 'R', name: 'ALL IN', text: '勝つたびのクレジットが 3 倍', cost: '負けるとライフがさらに −2' }
];
const PATCH = Object.fromEntries(PATCHES.map(p => [p.id, p]));
export const RARITY = {
  C: { name: 'COMMON', weight: 56, price: 5 }, R: { name: 'RARE', weight: 30, price: 7 },
  E: { name: 'EPIC', weight: 10, price: 10 }, L: { name: 'LEGENDARY', weight: 4, price: 15 }
};
export const GACHA_COST = 4;
export const HEAL_PRICE = 4;

/* ビルド: 同じ系統のパッチを集めたときのボーナス (2つで1段目、3つ以上で2段目も) */
export const TAGS = {
  HAND: { name: 'HAND', label: '手札', color: '#ff8fc8', bonus: ['相手のはじめの手札 さらに −1', '自分のはじめの手札 さらに +1'] },
  GUARD: { name: 'GUARD', label: '守り', color: '#7cc4ff', bonus: ['最大ライフ +1', '勝つたびにライフ +1'] },
  GREED: { name: 'GREED', label: '強欲', color: '#ffc85a', bonus: ['勝つたびにクレジット +2', 'GACHA の EPIC 以上が出やすい (2 倍)'] },
  TEMPO: { name: 'TEMPO', label: '先手', color: '#7cf0d0', bonus: ['精鋭・呪いの試合に勝つとクレジット +3', 'いつも先攻で、はじめからコントロールを持つ'] },
  RISK: { name: 'RISK', label: '賭け', color: '#ff4f6d', bonus: ['勝つたびにライフ +1', '最大ライフ +3'] }
};

/* イベント。options[i].apply(run, ctx) が新しい状態を返す (ctx: { names, rnd })。
   fight: その選択のあとで戦う (cursed = 呪い) */
export const EVENTS = {
  shady: {
    title: '怪しいパッチ', text: '出どころの分からないパッチが落ちている。',
    options: [
      { label: 'ライフ −1 で拾う (ランダムなパッチ)', need: (r) => r.life > 1, apply: (r, c) => gainRandomPatch({ ...r, life: r.life - 1 }, c.rnd) },
      { label: '立ち去る', apply: (r) => r }
    ]
  },
  repair: {
    title: '修理ステーション', text: '古い修理機が、まだ動いている。',
    options: [
      { label: 'ライフを 3 回復', apply: (r) => ({ ...r, life: Math.min(r.maxLife, r.life + 3) }) },
      { label: '最大ライフ +1', apply: (r) => ({ ...r, maxLife: r.maxLife + 1, life: r.life + 1 }) }
    ]
  },
  teleporter: {
    title: '転送装置', text: 'デッキのプロトコルを1つ、どこかへ飛ばしてしまう装置。',
    options: [
      { label: 'ランダムに1つ入れ替わる代わりに、ライフ +2', apply: (r, c) => randomSwap({ ...r, life: Math.min(r.maxLife, r.life + 2) }, c) },
      { label: '立ち去る', apply: (r) => r }
    ]
  },
  arcade: {
    title: '壊れたガチャ筐体', text: 'コインを入れなくても、レバーが回りそうだ。',
    options: [
      { label: 'タダで1回引く', apply: (r, c) => pull(r, c.rnd).run },
      { label: '中のクレジットを持っていく (+5)', apply: (r) => ({ ...r, credits: (r.credits | 0) + 5 }) }
    ]
  },
  vault: {
    title: '封印された保管庫', text: 'パッチが眠っている。開ければ警報が鳴る。',
    options: [
      { label: 'パッチを3つから選ぶ (そのあと、1段強い相手と戦う)', apply: (r, c) => ({ ...r, route: 'alarm', phase: 'patch', patchOffers: patchOffers(r, c.rnd), after: 'battle' }) },
      { label: '立ち去る', apply: (r) => r }
    ]
  },
  altar: {
    title: '呪いの祭壇', text: '祭壇に触れると、次の試合が呪われる。そのかわり…',
    options: [
      { label: '呪われた試合に挑む (自分の手札 4 枚・相手 7 枚。勝てば RARE 以上確定の GACHA とクレジット)', apply: (r) => ({ ...r, fight: 'cursed' }) },
      { label: '立ち去る', apply: (r) => r }
    ]
  },
  lab: {
    title: '研究所', text: '白衣の研究員が手招きしている。「実験に付き合ってくれたら、お礼をするよ」',
    options: [
      { label: 'カードを1枚強化してもらう (値 +1)', need: (r) => canUpgradeAny(r), apply: (r) => ({ ...r, phase: 'upgrade', after: 'map' }) },
      { label: 'ライフ −1 で ★ カードをもらう (デッキのプロトコルのどれか)', need: (r) => r.life > 1 && starChoices(r).length > 0,
        apply: (r, c) => addStar({ ...r, life: r.life - 1 }, pickOne(starChoices(r), c.rnd)) },
      { label: '断る', apply: (r) => r }
    ]
  },
  meteor: {
    title: '流れ星', text: '光るカードが空から落ちてきた。拾うと、何かに見つかる気がする…',
    options: [
      { label: '★ カードを拾う (そのあと、1段強い相手と戦う)', need: (r) => starChoices(r).length > 0,
        apply: (r, c) => ({ ...addStar(r, pickOne(starChoices(r), c.rnd)), fight: 'alarm' }) },
      { label: '見送る', apply: (r) => r }
    ]
  },
  purge: {
    title: 'デバッガー', text: '「そのデッキ、無駄が多いね。1枚消してあげよう。代わりにライフを少しもらうよ」',
    options: [
      { label: 'ライフ −1 でカードを1枚外す', need: (r) => r.life > 1 && canRemove(r), apply: (r) => ({ ...r, life: r.life - 1, phase: 'remove', after: 'map' }) },
      { label: '断る', apply: (r) => r }
    ]
  }
};

/* HEAT (難しさ)。上の段は下の段の条件を全部含む */
export const HEATS = [
  { lv: 0, text: '標準' },
  { lv: 1, text: 'はじめのライフと最大ライフ −3' },
  { lv: 2, text: '「ふつう」の相手が「つよい」になる' },
  { lv: 3, text: '休憩所の回復が 1 少なくなる (+2)' },
  { lv: 4, text: '精鋭がいつも挑戦者になる' },
  { lv: 5, text: 'はじめのパッチが無い' }
];
export const MAX_HEAT = HEATS.length - 1;

/* ---------- 保存 ---------- */
export function loadRun() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    /* 地図になる前の保存 (v1) は続きから遊べない (はじめからやり直し) */
    return r && r.v === VERSION ? r : null;
  } catch (e) {
    return null;
  }
}
export function saveRun(run) {
  try {
    /* 保存のたびに1増える番号。2台の同期で、どちらが先に進んでいるかを比べる (cloudsave.js) */
    let rev = run.rev | 0;
    try { const old = JSON.parse(localStorage.getItem(KEY) || 'null'); if (old && old.startedAt === run.startedAt) rev = Math.max(rev, old.rev | 0); } catch (e) { /* 読めなければ手元の番号 */ }
    localStorage.setItem(KEY, JSON.stringify({ ...run, rev: rev + 1 }));
  } catch (e) { /* private mode */ }
}
export function clearRun() {
  try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
}
export function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (e) { return null; }
}
/* 最高記録。reached = 登った段 (クリアなら MAP_ROWS + 1) */
function saveBest(run) {
  const best = loadBest();
  const reached = run.phase === 'clear' ? MAP_ROWS + 1 : rowOf(run) + 1;
  const heat = run.heat | 0;
  const better = !best || heat > (best.heat | 0) ||
    (heat === (best.heat | 0) && (best.reached < reached || (best.reached === reached && best.life < run.life)));
  if (!better) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ reached, rows: MAP_ROWS, life: Math.max(0, run.life), deck: run.deck, heat, patches: run.patches || [], at: Date.now() }));
  } catch (e) { /* private mode */ }
}
/** 選べる HEAT の上限 (クリアした HEAT + 1) */
export function unlockedHeat() {
  try {
    const n = parseInt(localStorage.getItem(HEAT_KEY) || '0', 10);
    return Math.max(0, Math.min(MAX_HEAT, Number.isInteger(n) ? n : 0));
  } catch (e) {
    return 0;
  }
}
function unlockHeat(cleared) {
  const next = Math.min(MAX_HEAT, cleared + 1);
  if (next <= unlockedHeat()) return;
  try { localStorage.setItem(HEAT_KEY, String(next)); } catch (e) { /* private mode */ }
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
function weighted(pairs, rnd) {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  let x = rnd() * total;
  for (const [k, w] of pairs) { if (x < w) return k; x -= w; }
  return pairs[pairs.length - 1][0];
}

/* ---------- 地図 ---------- */
/* 下から上へ MAP_ROWS 段。0段目は全部戦闘、5段目は全部宝箱、10段目は全部休憩所、最上段は BOSS 1つ。
   ほかの段は 戦闘・イベント・精鋭 (3段目から)・ショップ (2段目から)・休憩所 (4段目から) を混ぜる。
   道は上の段の近いマスへ1〜2本。どのマスにも下から来る道がある */
export function makeMap(rnd = Math.random) {
  const rows = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const last = r === MAP_ROWS - 1;
    const n = last ? 1 : r === 0 ? 3 : 3 + Math.floor(rnd() * 2);
    const row = [];
    for (let i = 0; i < n; i++) {
      let type;
      if (last) type = 'boss';
      else if (r === 0) type = 'battle';
      else if (r === 5) type = 'treasure';
      else if (r === MAP_ROWS - 2) type = 'rest';
      else {
        type = weighted([['battle', 45], ['event', 22], ['elite', r >= 3 ? 14 : 0], ['shop', r >= 2 ? 10 : 0], ['rest', r >= 4 ? 9 : 0]], rnd);
      }
      /* 横の位置 (0〜1)。少し揺らして手描きの地図らしく */
      const x = n === 1 ? 0.5 : 0.12 + (0.76 * i) / (n - 1) + (rnd() - 0.5) * 0.08;
      row.push({ id: r + '-' + i, row: r, x: Math.round(x * 1000) / 1000, type, next: [] });
    }
    rows.push(row);
  }
  for (let r = 0; r < MAP_ROWS - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    a.forEach((node, i) => {
      const j = b.length === 1 ? 0 : Math.round((i * (b.length - 1)) / Math.max(1, a.length - 1));
      node.next.push(b[j].id);
      const k = j + (rnd() < 0.5 ? 1 : -1);
      if (b[k] && rnd() < 0.55 && !node.next.includes(b[k].id)) node.next.push(b[k].id);
    });
    for (const target of b) {
      if (a.some(n => n.next.includes(target.id))) continue;
      const near = a.slice().sort((p, q) => Math.abs(p.x - target.x) - Math.abs(q.x - target.x))[0];
      near.next.push(target.id);
    }
  }
  return { rows };
}
export function nodeById(run, id) {
  if (!run.map || !id) return null;
  const r = parseInt(String(id).split('-')[0], 10);
  return (run.map.rows[r] || []).find(n => n.id === id) || null;
}
function rowOf(run) {
  const n = nodeById(run, run.pos);
  return n ? n.row : -1;
}
/** いま進めるマス */
export function reachable(run) {
  if (!run.map) return [];
  if (!run.pos) return run.map.rows[0].map(n => n.id);
  const n = nodeById(run, run.pos);
  return n ? n.next.slice() : [];
}

/* ---------- パッチ ---------- */
export const hasPatch = (run, id) => (run.patches || []).includes(id);
export const patchInfo = (id) => PATCH[id] || null;

/** その系統のパッチの数 */
export function tagCount(run, tag) {
  return (run.patches || []).filter(id => PATCH[id] && PATCH[id].tag === tag).length;
}
/** その系統のボーナスの段 (0: なし / 1: 2つ / 2: 3つ以上) */
export function setLevel(run, tag) {
  const n = tagCount(run, tag);
  return n >= 3 ? 2 : n >= 2 ? 1 : 0;
}

/* パッチの候補 3 つ。持っている系統のものが出やすい (系統を狙ってそろえられるように)。
   持っている系統があれば、そのうち1つは必ず入れる (2026-09-29) */
function patchOffers(run, rnd) {
  const pool = PATCHES.filter(p => !p.gachaOnly && !hasPatch(run, p.id));
  const weightOf = (p) => 1 + 2 * Math.min(2, tagCount(run, p.tag));
  const picks = [];
  const owned = pool.filter(p => tagCount(run, p.tag) > 0);
  if (owned.length) picks.push(weighted(owned.map(p => [p.id, weightOf(p)]), rnd));
  while (picks.length < 3) {
    const left = pool.filter(p => !picks.includes(p.id));
    if (!left.length) break;
    picks.push(weighted(left.map(p => [p.id, weightOf(p)]), rnd));
  }
  /* 並びは混ぜる (必ず入れた1つがいつも左にならないように) */
  return sample(picks, picks.length, rnd);
}
/** テスト用: パッチの候補を作る */
export const patchOffersFor = (run, rnd = Math.random) => patchOffers(run, rnd);
/** そのパッチを取ると、系統ボーナスが何段目になるか (0: 変わらない)。画面の「あと1つで」に使う */
export function patchBonusStep(run, id) {
  const p = PATCH[id];
  if (!p) return 0;
  const n = tagCount(run, p.tag) + 1;
  return n === 2 ? 1 : n === 3 ? 2 : 0;
}
/* パッチを足す (取ったときに効くものはここで) */
function addPatch(run, id) {
  if (!PATCH[id] || hasPatch(run, id)) return run;
  let next = { ...run, patches: run.patches.concat(id) };
  if (id === 'battery') next = { ...next, maxLife: next.maxLife + 2, life: next.life + 2 };
  if (id === 'oneshot') { const m = Math.max(1, Math.ceil(next.maxLife / 2)); next = { ...next, maxLife: m, life: Math.min(next.life, m) }; }
  /* RISK を3つそろえた瞬間に最大ライフ +3 */
  if (PATCH[id].tag === 'RISK' && tagCount(next, 'RISK') === 3) next = { ...next, maxLife: next.maxLife + 3, life: next.life + 3 };
  /* GUARD を2つそろえた瞬間に最大ライフ +1 */
  if (PATCH[id].tag === 'GUARD' && tagCount(next, 'GUARD') === 2) next = { ...next, maxLife: next.maxLife + 1, life: next.life + 1 };
  return next;
}
function gainRandomPatch(run, rnd) {
  const pool = PATCHES.filter(p => !p.gachaOnly && !hasPatch(run, p.id));
  return pool.length ? addPatch(run, pool[Math.floor(rnd() * pool.length)].id) : run;
}
function randomSwap(run, c) {
  const pool = c.names.filter(n => !run.deck.includes(n));
  if (!pool.length) return run;
  const out = run.deck[Math.floor(c.rnd() * run.deck.length)];
  const add = pool[Math.floor(c.rnd() * pool.length)];
  return withDeck({ ...run, swapped: { out, add } }, run.deck.map(n => (n === out ? add : n)));
}
/* カードの id → プロトコル名 (★ は X_FIRE → FIRE) */
export function protoOfCard(id) {
  const b = baseOf(id);
  const star = STAR_CARDS.find(x => x.id === b);
  return star ? star.proto : b.replace(/_\d+$/, '');
}
/* デッキを変えたら、外したプロトコルのカードの除去・強化・★ は取り消す */
function withDeck(run, deck) {
  const keep = (id) => deck.includes(protoOfCard(id));
  return { ...run, deck, removed: (run.removed || []).filter(keep), upgrades: (run.upgrades || []).filter(keep), added: (run.added || []).filter(keep) };
}
const pickOne = (list, rnd) => list[Math.floor(rnd() * list.length)];

/* ---------- 強化 (＋) と ★ カード ---------- */
export const MAX_ADDED = 3;                   // 足せる ★ の数 (1プロトコル1枚まで)
/** まだ足していない、デッキのプロトコルの ★ */
export function starChoices(run) {
  return run.deck.map(n => starOf(n)).filter(s => s && !(run.added || []).includes(s.id)).map(s => s.id);
}
function addStar(run, id) {
  if (!id || (run.added || []).includes(id) || (run.added || []).length >= MAX_ADDED) return run;
  return { ...run, added: (run.added || []).concat(id), gotStar: id };
}
/** 強化できるカードが残っているか (値の上限は画面が確かめる。ここでは数だけ) */
export function canUpgradeAny(run) {
  return (run.upgrades || []).length < run.deck.length * 6 + (run.added || []).length;
}
/** 強化する (id は元の id)。デッキのカードか足した ★ で、まだ強化していないもの */
export function upgradeCard(run, id) {
  if (run.phase !== 'upgrade') return run;
  const ok = (run.added || []).includes(id) || (run.deck.includes(protoOfCard(id)) && !isStar(id) && !(run.removed || []).includes(id));
  if (!ok || (run.upgrades || []).includes(id)) return run;
  const next = { ...run, upgrades: (run.upgrades || []).concat(id), upgradedNow: id, paidUpgrade: 0 };
  return { ...next, phase: backTo(run, run.after), ...(run.after === 'reward' ? { cardOffers: [] } : {}) };
}
/** 強化をやめる (ショップで払った分は返す) */
export function cancelUpgrade(run) {
  if (run.phase !== 'upgrade') return run;
  if (run.after === 'shop') {
    return { ...run, phase: 'shop', credits: (run.credits | 0) + (run.paidUpgrade | 0), upgradeCost: (run.upgradeCost | 0) - (run.paidUpgrade ? 2 : 0), paidUpgrade: 0 };
  }
  if (run.after === 'reward') return { ...run, phase: 'cards' };        // カードの報酬を選び直す
  return { ...run, phase: 'map' };
}

/* ---------- カードの報酬 (勝つたびに1つ選ぶ) ----------
   強化 (好きなカードを1枚 値 +1) / ★ カード (デッキのプロトコルの ★ を1枚) / 除去 (好きなカードを1枚外す)。
   選べないもの (★ を足し切った・除去の上限) は、クレジット +3 に替える */
export const CARD_REWARD_CREDITS = 3;
export function cardRewardOffers(run, rnd = Math.random) {
  const out = [];
  out.push(canUpgradeAny(run) ? { type: 'upgrade' } : { type: 'credits' });
  const stars = (run.added || []).length < MAX_ADDED ? starChoices(run) : [];
  out.push(stars.length ? { type: 'star', id: pickOne(stars, rnd) } : { type: 'credits' });
  out.push(canRemove(run) ? { type: 'remove' } : { type: 'credits' });
  return out;
}
/** カードの報酬を選ぶ (index: 候補の番号 / null: 取らない)。強化・除去は、選ぶ画面へ (やめたらこの画面に戻る) */
export function chooseCardReward(run, index) {
  if (run.phase !== 'cards') return run;
  const o = index === null || index === undefined ? null : (run.cardOffers || [])[index];
  const done = { ...run, cardOffers: [], phase: 'reward' };
  if (!o) return done;
  if (o.type === 'upgrade') return { ...run, phase: 'upgrade', after: 'reward' };
  if (o.type === 'remove') return { ...run, phase: 'remove', after: 'reward' };
  if (o.type === 'star') return addStar(done, o.id);
  if (o.type === 'credits') return { ...done, credits: (run.credits | 0) + CARD_REWARD_CREDITS };
  return done;
}
/* 強化・除去を終えた (やめた) あとに戻る画面 */
function backTo(run, after) {
  if (after === 'shop') return 'shop';
  if (after === 'reward') return 'reward';
  return 'map';
}

/* ---------- GACHA ---------- */
const discount = (run) => (hasPatch(run, 'lucky') ? 1 : 0);
/** 1回の値段 (LUCKY COIN で 1 安い) */
export function gachaCost(run) {
  return GACHA_COST - discount(run);
}
const PULL_PHASES = ['map', 'shop', 'reward'];
/** 引けるか (戦いの合間だけ) */
export function canPull(run) {
  return PULL_PHASES.includes(run.phase) && (run.credits | 0) >= gachaCost(run);
}
/* レア度を引き、そのレア度のパッチから1つ。持っているものが出たら「かぶり」でライフ +1。
   minRare: RARE 以上確定 (呪いの試合の報酬) */
function pull(run, rnd, minRare) {
  /* GREED 2段目: EPIC 以上の重みが 2 倍 (そのぶん COMMON が減る) */
  const w = Object.fromEntries(Object.entries(RARITY).map(([k, v]) => [k, v.weight]));
  if (setLevel(run, 'GREED') >= 2) { w.C -= w.E + w.L; w.E *= 2; w.L *= 2; }
  let roll = rnd() * 100;
  let rar = 'C';
  for (const k of ['L', 'E', 'R', 'C']) { if (roll < w[k]) { rar = k; break; } roll -= w[k]; }
  if (minRare && rar === 'C') rar = 'R';
  const pool = PATCHES.filter(p => p.rar === rar);
  const p = pool[Math.floor(rnd() * pool.length)];
  const dupe = hasPatch(run, p.id);
  const got = dupe ? { ...run, life: Math.min(run.maxLife, run.life + 1) } : addPatch(run, p.id);
  const result = { id: p.id, rar, dupe };
  return { run: { ...got, pulls: (run.pulls | 0) + 1, lastPull: result }, result };
}
/** GACHA を1回。クレジットが足りなければそのまま */
export function gachaPull(run, rnd = Math.random) {
  if (!canPull(run)) return run;
  return pull({ ...run, credits: (run.credits | 0) - gachaCost(run) }, rnd).run;
}

/* ---------- カード除去 ---------- */
export function canRemove(run) {
  return (run.removed || []).length < MAX_REMOVED;
}
/** 外す (defId)。デッキのプロトコルのカードで、まだ外していないものだけ */
export function removeCard(run, defId) {
  if (run.phase !== 'remove' || !canRemove(run)) return run;
  const proto = String(defId).replace(/_\d+$/, '');
  if (!run.deck.includes(proto) || (run.removed || []).includes(defId)) return run;
  const next = { ...run, removed: (run.removed || []).concat(defId), removedNow: defId, paidRemove: 0 };
  return { ...next, phase: backTo(run, run.after), ...(run.after === 'reward' ? { cardOffers: [] } : {}) };
}
/** 外すのをやめる (ショップで払った分は返す) */
export function cancelRemove(run) {
  if (run.phase !== 'remove') return run;
  if (run.after === 'shop') {
    return { ...run, phase: 'shop', credits: (run.credits | 0) + (run.paidRemove | 0), removeCost: (run.removeCost | 0) - (run.paidRemove ? 2 : 0), paidRemove: 0 };
  }
  if (run.after === 'reward') return { ...run, phase: 'cards' };
  return { ...run, phase: 'map' };
}

/* ---------- 進行 (すべて新しい状態を返す) ---------- */
export function newRun(names, rnd = Math.random, heat = 0) {
  const h = Math.max(0, Math.min(MAX_HEAT, heat | 0));
  const life = RUN_LIFE - (h >= 1 ? HEAT_LIFE : 0);
  return { v: VERSION, phase: 'draft', deck: [], removed: [], life, maxLife: life, heat: h, patches: [], failsafeUsed: false, phoenixUsed: false,
    credits: START_CREDITS, pulls: 0, map: makeMap(rnd), pos: null, visited: [], removeCost: 5, upgradeCost: 4, upgrades: [], added: [],
    boss: chooseBoss(h, rnd),
    offers: sample(names, 3, rnd), opp: null, route: 'normal', history: [], startedAt: Date.now() };
}

export function draftPick(run, name, names, rnd = Math.random) {
  if (run.phase !== 'draft' || !run.offers.includes(name)) return run;
  const deck = run.deck.concat(name);
  if (deck.length < 3) {
    return { ...run, deck, offers: sample(names.filter(n => !deck.includes(n)), 3, rnd) };
  }
  const drafted = { ...run, deck, offers: [] };
  /* はじめのパッチ (HEAT 5 では無し) */
  if (drafted.heat >= 5) return { ...drafted, phase: 'map' };
  return { ...drafted, phase: 'patch', patchOffers: patchOffers(drafted, rnd), after: 'map' };
}

/* パッチを選ぶ (id が null なら取らない)。そのあと地図か戦う前へ */
export function choosePatch(run, id, names, rnd = Math.random) {
  if (run.phase !== 'patch') return run;
  const got = id && (run.patchOffers || []).includes(id) ? addPatch(run, id) : run;
  const next = { ...got, patchOffers: [], pendingPatch: false };
  return run.after === 'battle' ? prepareBattle(next, names, rnd, next.route) : { ...next, phase: 'map' };
}

/* 地図でマスを選ぶ */
export function chooseNode(run, id, names, rnd = Math.random) {
  if (run.phase !== 'map' || !reachable(run).includes(id)) return run;
  const node = nodeById(run, id);
  const moved = { ...run, pos: id, visited: (run.visited || []).concat(id), swapped: null, lastPull: null, lastSaved: false,
    cursedWin: false, removedNow: null, upgradedNow: null, gotStar: null, lastGain: 0 };
  switch (node.type) {
    case 'battle': case 'elite': case 'boss': return prepareBattle(moved, names, rnd, node.type === 'elite' ? 'elite' : 'normal');
    case 'event': {
      const keys = Object.keys(EVENTS);
      return { ...moved, phase: 'event', event: keys[Math.floor(rnd() * keys.length)] };
    }
    case 'rest': return { ...moved, phase: 'rest' };
    case 'shop': return { ...moved, phase: 'shop', shop: makeShop(moved, rnd) };
    case 'treasure': return { ...moved, phase: 'patch', patchOffers: patchOffers(moved, rnd), after: 'map' };
    default: return run;
  }
}

/* イベントの選択 */
export function resolveEvent(run, index, names, rnd = Math.random) {
  if (run.phase !== 'event') return run;
  const ev = EVENTS[run.event];
  const opt = ev && ev.options[index];
  if (!opt || (opt.need && !opt.need(run))) return run;
  const next = opt.apply({ ...run, eventDone: { id: run.event, choice: index } }, { names, rnd });
  if (next.phase === 'patch' || next.phase === 'remove' || next.phase === 'upgrade') return { ...next, event: null };
  if (next.fight) return prepareBattle({ ...next, fight: null, event: null }, names, rnd, next.fight);
  return { ...next, event: null, phase: 'map' };
}

/* ---------- 休憩所 ---------- */
/** 回復の量 (HEAT 3 から +1) */
export function healAmount(run) {
  return (run.heat | 0) >= 3 ? RUN_HEAL - 1 : RUN_HEAL;
}
export function restHeal(run) {
  if (run.phase !== 'rest') return run;
  return { ...run, life: Math.min(run.maxLife, run.life + healAmount(run)), phase: 'map' };
}
export function restUpgrade(run) {
  if (run.phase !== 'rest' || !canUpgradeAny(run)) return run;
  return { ...run, phase: 'upgrade', after: 'map' };
}
export function restRemove(run) {
  if (run.phase !== 'rest' || !canRemove(run)) return run;
  return { ...run, phase: 'remove', after: 'map' };
}

/* ---------- ショップ ---------- */
function makeShop(run, rnd) {
  /* パッチ3つ (LEGENDARY も並ぶことがある)。値段はレア度で決まる */
  const pool = PATCHES.filter(p => !hasPatch(run, p.id));
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const left = pool.filter(p => !picks.includes(p.id));
    if (!left.length) break;
    const rar = weighted([['C', 50], ['R', 32], ['E', 13], ['L', 5]].filter(([k]) => left.some(p => p.rar === k)), rnd);
    const cands = left.filter(p => p.rar === rar);
    picks.push(cands[Math.floor(rnd() * cands.length)].id);
  }
  /* ★ カード1枚 (デッキのプロトコルのどれか。まだ足していないもの) */
  const stars = starChoices(run);
  return { patches: picks, sold: [], healed: false, star: stars.length ? stars[Math.floor(rnd() * stars.length)] : null, starSold: false };
}
export const STAR_PRICE = 8;
export function starPrice(run) { return STAR_PRICE - discount(run); }
export function upgradePrice(run) { return (run.upgradeCost || 4) - discount(run); }
export function buyStar(run) {
  if (run.phase !== 'shop' || !run.shop.star || run.shop.starSold || (run.added || []).length >= MAX_ADDED) return run;
  const price = starPrice(run);
  if ((run.credits | 0) < price) return run;
  return { ...addStar({ ...run, credits: run.credits - price }, run.shop.star), shop: { ...run.shop, starSold: true } };
}
export function buyUpgrade(run) {
  if (run.phase !== 'shop' || !canUpgradeAny(run)) return run;
  const price = upgradePrice(run);
  if ((run.credits | 0) < price) return run;
  return { ...run, credits: run.credits - price, paidUpgrade: price, upgradeCost: (run.upgradeCost || 4) + 2, phase: 'upgrade', after: 'shop' };
}
export function patchPrice(run, id) {
  return RARITY[PATCH[id].rar].price - discount(run);
}
export function removePrice(run) {
  return (run.removeCost | 0) - discount(run);
}
export function healPrice(run) {
  return HEAL_PRICE - discount(run);
}
export function buyPatch(run, id) {
  if (run.phase !== 'shop' || !run.shop.patches.includes(id) || run.shop.sold.includes(id)) return run;
  const price = patchPrice(run, id);
  if ((run.credits | 0) < price || hasPatch(run, id)) return run;
  const got = addPatch({ ...run, credits: run.credits - price }, id);
  return { ...got, shop: { ...run.shop, sold: run.shop.sold.concat(id) } };
}
export function buyRemove(run) {
  if (run.phase !== 'shop' || !canRemove(run)) return run;
  const price = removePrice(run);
  if ((run.credits | 0) < price) return run;
  return { ...run, credits: run.credits - price, paidRemove: price, removeCost: (run.removeCost | 0) + 2, phase: 'remove', after: 'shop' };
}
export function buyHeal(run) {
  if (run.phase !== 'shop' || run.shop.healed || run.life >= run.maxLife) return run;
  const price = healPrice(run);
  if ((run.credits | 0) < price) return run;
  return { ...run, credits: run.credits - price, life: Math.min(run.maxLife, run.life + RUN_HEAL), shop: { ...run.shop, healed: true } };
}
export function leaveShop(run) {
  return run.phase === 'shop' ? { ...run, phase: 'map' } : run;
}

/* ---------- 戦闘 ---------- */
/* いまのマスの相手を決めて、戦う前の状態にする。
   route: normal / elite (強い。勝つとパッチ) / alarm (保管庫の警報。1段強いだけ) / cursed (呪い) */
export function prepareBattle(run, names, rnd = Math.random, route = 'normal') {
  const node = nodeById(run, run.pos) || { row: 0, type: 'battle' };
  const heat = run.heat | 0;
  let opp;
  if (node.type === 'boss') { const B = bossOf(run); opp = { deck: B.deck.slice(), level: 3, boss: true, bossId: B.id }; }
  else if (route === 'elite' && (node.row >= 6 || heat >= 4)) {
    const i = Math.floor(rnd() * CHALLENGERS.length);
    opp = { deck: CHALLENGERS[i].deck.slice(), level: CHALLENGER_BASE + i };
  } else {
    let level = node.row < EASY_ROWS ? 0 : node.row < 4 ? 1 : 2;
    if (heat >= 2 && level < 2) level += 1;
    if (route === 'elite' || route === 'alarm') level = Math.min(3, level + 1);
    opp = { deck: sample(names.filter(n => !run.deck.includes(n)), 3, rnd), level };
  }
  if (route === 'elite') opp.elite = true;
  return { ...run, phase: 'battle', opp, offers: [], route, event: null };
}

/* その試合でライフが減る量。compiles = 相手にコンパイルされた回数 */
export function damageOf(run, compiles) {
  const n = Math.max(0, compiles | 0);
  return hasPatch(run, 'firewall') && n > 0 ? n - 1 : n;
}
/* この回数でライフが尽きるか (FAILSAFE・PHOENIX が残っていれば尽きない) */
export function lethal(run, compiles) {
  return damageOf(run, compiles) >= run.life && !(hasPatch(run, 'failsafe') && !run.failsafeUsed) && !(hasPatch(run, 'phoenix') && !run.phoenixUsed);
}

/** 勝ったときのクレジット */
export function creditGain(run, compiles) {
  const hard = run.route === 'elite' || run.route === 'alarm' || run.route === 'cursed';
  let gain = hard ? 5 : 3;
  if ((compiles | 0) === 0) gain += 1;
  if (hasPatch(run, 'jackpot')) gain += 2;
  if (setLevel(run, 'GREED') >= 1) gain += 2;
  if (setLevel(run, 'TEMPO') >= 1 && (run.route === 'elite' || run.route === 'cursed')) gain += 3;
  if (hasPatch(run, 'midas')) gain *= 2;
  if (hasPatch(run, 'allin')) gain *= 3;
  return gain;
}

/* 1戦の結果。compiles = その試合で相手にコンパイルされた回数 */
export function finishBattle(run, win, compiles, names, rnd = Math.random) {
  if (run.phase !== 'battle') return run;
  const damage = damageOf(run, compiles) + (!win && hasPatch(run, 'allin') ? 2 : 0);
  let life = run.life - damage;
  let failsafeUsed = !!run.failsafeUsed;
  let phoenixUsed = !!run.phoenixUsed;
  let saved = false;
  if (life <= 0 && hasPatch(run, 'failsafe') && !failsafeUsed) { life = 1; failsafeUsed = true; saved = 'failsafe'; }
  else if (life <= 0 && hasPatch(run, 'phoenix') && !phoenixUsed) { life = run.maxLife; phoenixUsed = true; saved = 'phoenix'; }
  const gain = win ? creditGain(run, compiles) : 0;
  if (win && life > 0) {
    if (hasPatch(run, 'repair')) life += 1;
    if (setLevel(run, 'GUARD') >= 2) life += 1;
    if (setLevel(run, 'RISK') >= 1) life += 1;
    if (hasPatch(run, 'sweep') && (compiles | 0) === 0) life += 2;
    life = Math.min(run.maxLife, life);
  }
  const node = nodeById(run, run.pos) || { row: 0 };
  const history = run.history.concat({ row: node.row, win: !!win, damage, opp: run.opp.deck, route: run.route || 'normal', saved });
  let base = { ...run, life, history, failsafeUsed, phoenixUsed, lastSaved: saved, credits: (run.credits | 0) + gain, lastGain: gain, lastPull: null };
  /* 呪いの試合に勝った: RARE 以上確定の GACHA をタダで1回 */
  if (win && life > 0 && run.route === 'cursed') base = { ...pull(base, rnd, true).run, cursedWin: true };
  let next;
  if (life <= 0) next = { ...base, life: 0, phase: 'over' };
  else if (!win) next = base;                                          // 同じ相手とやり直す
  else if (run.opp.boss) next = { ...base, phase: 'clear' };
  else {
    /* まずカードの報酬 (cards) を選び、そのあとプロトコルの入れ替え (reward) */
    next = { ...base, phase: 'cards', cardOffers: cardRewardOffers(base, rnd), pendingPatch: !!run.opp.elite,
      upgradedNow: null, removedNow: null, gotStar: null,
      offers: sample(names.filter(n => !run.deck.includes(n)), hasPatch(run, 'search') ? 4 : 3, rnd) };
  }
  if (next.phase === 'over' || next.phase === 'clear') saveBest(next);
  if (next.phase === 'clear') unlockHeat(next.heat | 0);
  return next;
}

/* 報酬: { type: 'swap', add, remove } / { type: 'skip' }。精鋭に勝ったあとはパッチを選ぶ */
export function applyReward(run, choice, names, rnd = Math.random) {
  if (run.phase !== 'reward') return run;
  let next = run;
  if (choice.type === 'swap' && run.offers.includes(choice.add) && run.deck.includes(choice.remove)) {
    next = withDeck(run, run.deck.map(n => (n === choice.remove ? choice.add : n)));
  }
  if (run.pendingPatch) {
    const offers = patchOffers(next, rnd);
    if (offers.length) return { ...next, offers: [], phase: 'patch', patchOffers: offers, after: 'map' };
  }
  return { ...next, offers: [], phase: 'map', pendingPatch: false };
}

/* 試合のはじめ方 (パッチ・ビルド・呪い・カード除去)。me = 自分の席 */
export function battleOpts(run, me) {
  const other = 1 - me;
  const hand = [5, 5];
  if (hasPatch(run, 'cache')) hand[me] += 1;
  if (hasPatch(run, 'buffer')) hand[me] += 1;
  if (hasPatch(run, 'overflow')) hand[me] = 7;
  if (hasPatch(run, 'jammer')) hand[other] = 4;
  if (hasPatch(run, 'singularity')) hand[other] = 3;
  if (hasPatch(run, 'gluttony')) { hand[me] = Math.max(hand[me], 7); hand[other] = 7; }
  if (hasPatch(run, 'nocost')) hand[me] -= 2;
  /* HAND のビルド */
  if (setLevel(run, 'HAND') >= 1) hand[other] = Math.max(3, hand[other] - 1);
  if (setLevel(run, 'HAND') >= 2) hand[me] += 1;
  hand[me] = Math.max(1, Math.min(7, hand[me]));
  /* 呪い: パッチより強い */
  if (run.route === 'cursed') { hand[me] = 4; hand[other] = 7; }
  /* BOSS のルール (パッチより強い) */
  const boss = run.opp && run.opp.boss ? bossOf({ boss: run.opp.bossId || run.boss }).rule : null;
  if (boss && boss.bossHand) hand[other] = boss.bossHand;
  if (boss && boss.meHand) hand[me] = boss.meHand;
  const tempo = setLevel(run, 'TEMPO') >= 2;
  const exclude = [[], []];
  exclude[me] = (run.removed || []).slice(0, MAX_REMOVED);
  /* 強化 (＋) と ★ カード: 強化したカードは ＋ 版に替え、★ は山札に足す (★ を強化していれば ★＋) */
  const ups = run.upgrades || [];
  const added = run.added || [];
  const deckMods = [{}, {}];
  deckMods[me] = { swap: Object.fromEntries(ups.filter(id => !isStar(id)).map(id => [id, id + UP])), add: added.map(id => (ups.includes(id) ? id + UP : id)) };
  if (boss && (boss.upgradeAll || boss.stars)) {
    const swap = {};
    if (boss.upgradeAll) for (const n of run.opp.deck) for (let k = 1; k <= 6; k++) swap[n + '_' + k] = n + '_' + k + UP;   // 値 6 は ＋ が無いのでそのまま (engine)
    deckMods[other] = { swap, add: (boss.stars || []).slice() };
  }
  const bossFirst = boss && boss.bossFirst, bossControl = boss && boss.bossControl;
  /* RISK のパッチ: 値と「捨てる」を変える (engine の perks) */
  const pk = {};
  if (hasPatch(run, 'nocost')) pk.freeDiscard = true;
  if (hasPatch(run, 'double') && run.deck[0]) { pk.doubleProto = run.deck[0]; pk.otherMinus = 1; }
  if (hasPatch(run, 'shadow')) { pk.faceDownValue = 4; pk.faceUpMinus = 1; }
  const perks = [null, null];
  if (Object.keys(pk).length) perks[me] = pk;
  /* ONE SHOT: 自分は1本で勝ち (ボスの「聖域」でも1本) */
  const base = runWinCompiles(run);
  let win = boss && boss.win ? (me === 0 ? boss.win.slice() : boss.win.slice().reverse()) : [base, base];
  if (hasPatch(run, 'oneshot')) win[me] = 1;
  /* 自分の本数はルールどおり 3 本にして、足りない分をはじめからコンパイル済みにする (どれかはランダム)。
     「1本で勝ち」なら 2 つ済みの状態から始まる。相手の本数はそのまま (2026-09-29) */
  const startCompiled = [0, 0];
  if (win[me] < 3) { startCompiled[me] = 3 - win[me]; win[me] = 3; }
  return {
    winCompiles: base,
    startCompiled,
    handSize: hand,
    ...(exclude[me].length ? { exclude } : {}),
    ...(ups.length || added.length || deckMods[other].swap || deckMods[other].add ? { deckMods } : {}),
    winCompilesBySide: win,
    ...(perks[me] ? { perks } : {}),
    ...(bossFirst ? { first: other } : hasPatch(run, 'initiative') || tempo ? { first: me } : {}),
    ...(bossControl ? { startControl: other } : hasPatch(run, 'root') || tempo ? { startControl: me } : {})
  };
}

/* 相手 (side) がコンパイルした回数 (効果でコンパイル完了にしたものも)。
   エンジンの集計 (state.tally) を使う。古い行が捨てられる actionLog は、集計の無い盤面だけに使う */
export function compilesBy(state, side) {
  if (state && state.tally && Array.isArray(state.tally.compiles)) return state.tally.compiles[side] || 0;
  const tag = 'P' + (side + 1) + ': ';
  return (state && state.actionLog || []).filter(line => {
    const s = String(line);
    return s.startsWith(tag) && (/ライン\d+をコンパイル$/.test(s) || /をコンパイル完了にした/.test(s));
  }).length;
}
