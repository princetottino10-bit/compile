/* =========================================================================
 * 勝ち抜き戦 (ローグライク。Slay the Spire のような地図を登る形) の進行と保存。画面は run-ui.js
 *   ・3回のドラフト (3つの候補から1つ) でデッキを作り、はじめのパッチを1つ選ぶ
 *   ・地図は下から上へ 12 段。最初から全部見えていて、つながっている道を1段ずつ選んで登る
 *       ⚔ 戦闘 / ☠ 精鋭 (強い。勝つとパッチ) / ? イベント / ✚ 休憩所 (回復かカード除去) /
 *       $ ショップ (パッチ・カード除去・回復・GACHA) / ◆ 宝箱 (パッチ) / ♛ BOSS (最上段)
 *   ・1試合は2本先取。ライフは勝ち抜き戦を通して持ち越し、相手に1回コンパイルされるたびに 1 減る
 *   ・負けたら同じ相手とやり直し。ライフが 0 になったら終わり
 *   ・勝つとクレジットと、プロトコルの入れ替え (取らなくてもよい)
 *   ・カード除去: デッキから1枚ずつ外して、欲しいカードが来やすくする (最大 6 枚)
 *   ・パッチ (勝ち抜き戦のあいだ効き続ける改造) には系統 (HAND / GUARD / GREED / TEMPO) があり、
 *     同じ系統を 2つ・3つ集めるとボーナス (ビルド)
 *   ・クリアすると次の HEAT (難しさ) が解放される (最大 5。上の段は下の段の条件を全部含む)
 *   1戦ごとにページを作り直すので、状態は localStorage に置く
 * ========================================================================= */
import { STRONGEST_AI, CHALLENGERS, CHALLENGER_BASE } from './aidecks.js';

const KEY = 'compileRun';
const BEST_KEY = 'compileRunBest';
const HEAT_KEY = 'compileRunHeat';
const VERSION = 2;

export const RUN_LIFE = 5;
export const RUN_HEAL = 2;
/* 勝ち抜き戦の1試合は 2本先取 (通常の3本では1周が長すぎる) */
export const RUN_WIN_COMPILES = 2;
export const MAP_ROWS = 12;                 // 最上段が BOSS
export const MAX_REMOVED = 6;               // 山札を 12 枚より減らさない
export const START_CREDITS = 4;

/* 地図のマス */
export const NODES = {
  battle: { icon: '⚔', name: '戦闘', text: 'いつもの相手。勝てばクレジットと報酬' },
  elite: { icon: '☠', name: '精鋭', text: '強い相手。勝てばクレジット多めと、パッチを1つ' },
  event: { icon: '?', name: 'イベント', text: '何かが起きる' },
  rest: { icon: '✚', name: '休憩所', text: 'ライフを回復するか、カードを1枚外す' },
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
  { id: 'midas', tag: 'GREED', kind: 'life', rar: 'L', gachaOnly: true, name: 'MIDAS TOUCH', text: 'もらえるクレジットが 2 倍' }
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
  TEMPO: { name: 'TEMPO', label: '先手', color: '#7cf0d0', bonus: ['精鋭・呪いの試合に勝つとクレジット +3', 'いつも先攻で、はじめからコントロールを持つ'] }
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
      { label: 'ライフを 2 回復', apply: (r) => ({ ...r, life: Math.min(r.maxLife, r.life + 2) }) },
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
  { lv: 1, text: 'はじめのライフと最大ライフ −1' },
  { lv: 2, text: '「ふつう」の相手が「つよい」になる' },
  { lv: 3, text: '休憩所の回復が +1 になる' },
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
  try { localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) { /* private mode */ }
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

function patchOffers(run, rnd) {
  return sample(PATCHES.filter(p => !p.gachaOnly && !hasPatch(run, p.id)).map(p => p.id), 3, rnd);
}
/* パッチを足す (取ったときに効くものはここで) */
function addPatch(run, id) {
  if (!PATCH[id] || hasPatch(run, id)) return run;
  let next = { ...run, patches: run.patches.concat(id) };
  if (id === 'battery') next = { ...next, maxLife: next.maxLife + 2, life: next.life + 2 };
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
/* デッキを変えたら、外したプロトコルのカードの除去は取り消す */
function withDeck(run, deck) {
  return { ...run, deck, removed: (run.removed || []).filter(id => deck.includes(id.replace(/_\d+$/, ''))) };
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
  return { ...next, phase: run.after === 'shop' ? 'shop' : 'map' };
}
/** 外すのをやめる (ショップで払った分は返す) */
export function cancelRemove(run) {
  if (run.phase !== 'remove') return run;
  if (run.after === 'shop') {
    return { ...run, phase: 'shop', credits: (run.credits | 0) + (run.paidRemove | 0), removeCost: (run.removeCost | 0) - (run.paidRemove ? 2 : 0), paidRemove: 0 };
  }
  return { ...run, phase: 'map' };
}

/* ---------- 進行 (すべて新しい状態を返す) ---------- */
export function newRun(names, rnd = Math.random, heat = 0) {
  const h = Math.max(0, Math.min(MAX_HEAT, heat | 0));
  const life = RUN_LIFE - (h >= 1 ? 1 : 0);
  return { v: VERSION, phase: 'draft', deck: [], removed: [], life, maxLife: life, heat: h, patches: [], failsafeUsed: false, phoenixUsed: false,
    credits: START_CREDITS, pulls: 0, map: makeMap(rnd), pos: null, visited: [], removeCost: 5,
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
    cursedWin: false, removedNow: null, lastGain: 0 };
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
  if (next.phase === 'patch' || next.phase === 'remove') return { ...next, event: null };
  if (next.fight) return prepareBattle({ ...next, fight: null, event: null }, names, rnd, next.fight);
  return { ...next, event: null, phase: 'map' };
}

/* ---------- 休憩所 ---------- */
/** 回復の量 (HEAT 3 から +1) */
export function healAmount(run) {
  return (run.heat | 0) >= 3 ? 1 : RUN_HEAL;
}
export function restHeal(run) {
  if (run.phase !== 'rest') return run;
  return { ...run, life: Math.min(run.maxLife, run.life + healAmount(run)), phase: 'map' };
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
  return { patches: picks, sold: [], healed: false };
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
  return { ...run, credits: run.credits - price, life: Math.min(run.maxLife, run.life + 2), shop: { ...run.shop, healed: true } };
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
  if (node.type === 'boss') opp = { deck: STRONGEST_AI.slice(), level: 3, boss: true };
  else if (route === 'elite' && (node.row >= 6 || heat >= 4)) {
    const i = Math.floor(rnd() * CHALLENGERS.length);
    opp = { deck: CHALLENGERS[i].deck.slice(), level: CHALLENGER_BASE + i };
  } else {
    let level = node.row < 4 ? 1 : 2;
    if (heat >= 2 && level === 1) level = 2;
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
  return gain;
}

/* 1戦の結果。compiles = その試合で相手にコンパイルされた回数 */
export function finishBattle(run, win, compiles, names, rnd = Math.random) {
  if (run.phase !== 'battle') return run;
  const damage = damageOf(run, compiles);
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
    next = { ...base, phase: 'reward', pendingPatch: !!run.opp.elite,
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
  /* HAND のビルド */
  if (setLevel(run, 'HAND') >= 1) hand[other] = Math.max(3, hand[other] - 1);
  if (setLevel(run, 'HAND') >= 2) hand[me] += 1;
  hand[me] = Math.min(7, hand[me]);
  /* 呪い: パッチより強い */
  if (run.route === 'cursed') { hand[me] = 4; hand[other] = 7; }
  const tempo = setLevel(run, 'TEMPO') >= 2;
  const exclude = [[], []];
  exclude[me] = (run.removed || []).slice(0, MAX_REMOVED);
  return {
    winCompiles: RUN_WIN_COMPILES,
    handSize: hand,
    ...(exclude[me].length ? { exclude } : {}),
    ...(hasPatch(run, 'initiative') || tempo ? { first: me } : {}),
    ...(hasPatch(run, 'root') || tempo ? { startControl: me } : {})
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
