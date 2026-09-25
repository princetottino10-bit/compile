/* =========================================================================
 * 勝ち抜き戦 (ローグライク) の進行と保存。画面は run-ui.js
 *   ・3回のドラフト (3つの候補から1つ) でデッキを作り、はじめのパッチを1つ選ぶ
 *   ・全8戦。1試合は2本先取。相手は ふつう → つよい → 挑戦者 → 最強 (ボス) と強くなる
 *   ・2〜5戦目は、次に進む道を選ぶ: 通常戦 / 精鋭戦 (相手が1段強い。勝つとパッチ) / イベント (選択のあと通常戦)
 *   ・パッチ: 勝ち抜き戦のあいだ効き続ける改造。ライフや報酬に効くものと、試合のはじめ方を変えるものがある
 *   ・ライフは勝ち抜き戦を通して持ち越す。相手に1回コンパイルされるたびに 1 減る (リコンパイルも)
 *   ・勝ったら報酬を1つ (プロトコルを入れ替える / ライフを回復 / そのまま)
 *   ・負けたら同じ階をやり直す。ライフが 0 になったら終わり
 *   ・クリアすると、次の HEAT (難しさ) が解放される (最大 5。上の段は下の段の条件を全部含む)
 *   ・勝つとクレジット。戦いの合間に GACHA でパッチを引ける (COMMON / RARE / EPIC。かぶったらライフ回復)
 *   1戦ごとにページを作り直すので、状態は localStorage に置く
 * ========================================================================= */
import { STRONGEST_AI, CHALLENGERS, CHALLENGER_BASE } from './aidecks.js';

const KEY = 'compileRun';
const BEST_KEY = 'compileRunBest';
const HEAT_KEY = 'compileRunHeat';

export const RUN_LIFE = 5;
export const RUN_HEAL = 2;
/* 勝ち抜き戦の1試合は 2本先取 (通常の3本では1周が長すぎる) */
export const RUN_WIN_COMPILES = 2;
/* 各階の相手。level は aidecks.js の難易度 (1 ふつう / 2 つよい / 3 最強 / 5.. 挑戦者)。route: 進む道を選べる階 */
export const FLOORS = [
  { level: 1 }, { level: 1, route: true }, { level: 2, route: true }, { level: 2, route: true }, { level: 2, route: true },
  { challenger: true }, { challenger: true }, { level: 3, boss: true }
];

/* パッチ。kind: life (ライフ・報酬に効く) / game (試合のはじめ方を変える)。rar: ガチャのレア度 (C / R / E) */
export const PATCHES = [
  { id: 'battery', kind: 'life', rar: 'R', name: 'BACKUP BATTERY', text: '最大ライフ +2 (いまのライフも +2)' },
  { id: 'repair', kind: 'life', rar: 'C', name: 'SELF REPAIR', text: '勝つたびにライフ +1' },
  { id: 'firewall', kind: 'life', rar: 'R', name: 'FIREWALL', text: '各試合、最初にコンパイルされた1回はライフが減らない' },
  { id: 'failsafe', kind: 'life', rar: 'E', name: 'FAILSAFE', text: 'ライフが尽きる試合を1度だけ、ライフ 1 で耐える' },
  { id: 'sweep', kind: 'life', rar: 'C', name: 'CLEAN SWEEP', text: '1回もコンパイルされずに勝つとライフ +2' },
  { id: 'search', kind: 'life', rar: 'C', name: 'DEEP SEARCH', text: '報酬のプロトコルの候補が 4 つになる' },
  { id: 'lucky', kind: 'life', rar: 'C', name: 'LUCKY COIN', text: 'GACHA が 1 クレジット安くなる' },
  { id: 'jackpot', kind: 'life', rar: 'E', name: 'JACKPOT', text: '勝つたびにクレジット +1' },
  { id: 'initiative', kind: 'game', rar: 'R', name: 'INITIATIVE', text: 'いつも先攻' },
  { id: 'cache', kind: 'game', rar: 'R', name: 'EXTRA CACHE', text: 'はじめの手札が 6 枚' },
  { id: 'root', kind: 'game', rar: 'E', name: 'ROOT ACCESS', text: '試合のはじめからコントロールを持つ' },
  { id: 'jammer', kind: 'game', rar: 'C', name: 'JAMMER', text: '相手のはじめの手札が 4 枚' }
];
export const RARITY = { C: { name: 'COMMON', weight: 60 }, R: { name: 'RARE', weight: 30 }, E: { name: 'EPIC', weight: 10 } };
export const GACHA_COST = 3;
const PATCH = Object.fromEntries(PATCHES.map(p => [p.id, p]));

/* 進む道 */
export const ROUTES = {
  normal: { name: '通常戦', text: 'いつもの相手。勝てば報酬' },
  elite: { name: '精鋭戦', text: '相手が1段強い。勝てば報酬に加えてパッチを1つ' },
  event: { name: 'イベント', text: '何かが起きる。選んだあとで通常戦' }
};

/* イベント。options[i].apply(run, ctx) が新しい状態を返す (ctx: { names, rnd }) */
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
      { label: '中のクレジットを持っていく (+2)', apply: (r) => ({ ...r, credits: (r.credits | 0) + 2 }) }
    ]
  },
  vault: {
    title: '封印された保管庫', text: 'パッチが眠っている。開ければ警報が鳴る。',
    options: [
      { label: 'パッチを3つから選ぶ (次の相手が1段強くなる)', apply: (r, c) => ({ ...r, route: 'alarm', phase: 'patch', patchOffers: patchOffers(r, c.rnd), after: 'battle' }) },
      { label: '立ち去る', apply: (r) => r }
    ]
  }
};

/* HEAT (難しさ)。上の段は下の段の条件を全部含む */
export const HEATS = [
  { lv: 0, text: '標準' },
  { lv: 1, text: 'はじめのライフと最大ライフ −1' },
  { lv: 2, text: '「ふつう」の相手が「つよい」になる' },
  { lv: 3, text: '回復の報酬が +1 になる' },
  { lv: 4, text: '精鋭戦の相手が挑戦者になる' },
  { lv: 5, text: 'はじめのパッチが無い' }
];
export const MAX_HEAT = HEATS.length - 1;

/* ---------- 保存 ---------- */
export function loadRun() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && r.v === 1 ? normalize(r) : null;
  } catch (e) {
    return null;
  }
}
/* パッチ等が入る前の保存にも、足りない項目を足す */
function normalize(r) {
  return { patches: [], heat: 0, failsafeUsed: false, route: 'normal', credits: 0, pulls: 0, ...r };
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
  const heat = run.heat | 0;
  const better = !best || heat > (best.heat | 0) ||
    (heat === (best.heat | 0) && (best.reached < reached || (best.reached === reached && best.life < run.life)));
  if (!better) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ reached, life: Math.max(0, run.life), deck: run.deck, heat, patches: run.patches || [], at: Date.now() }));
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

export const hasPatch = (run, id) => (run.patches || []).includes(id);
export const patchInfo = (id) => PATCH[id] || null;

function patchOffers(run, rnd) {
  return sample(PATCHES.filter(p => !hasPatch(run, p.id)).map(p => p.id), 3, rnd);
}
/* パッチを足す (取ったときに効くものはここで) */
function addPatch(run, id) {
  if (!PATCH[id] || hasPatch(run, id)) return run;
  const next = { ...run, patches: run.patches.concat(id) };
  return id === 'battery' ? { ...next, maxLife: next.maxLife + 2, life: next.life + 2 } : next;
}
function gainRandomPatch(run, rnd) {
  const pool = PATCHES.filter(p => !hasPatch(run, p.id));
  return pool.length ? addPatch(run, pool[Math.floor(rnd() * pool.length)].id) : run;
}
function randomSwap(run, c) {
  const pool = c.names.filter(n => !run.deck.includes(n));
  if (!pool.length) return run;
  const out = run.deck[Math.floor(c.rnd() * run.deck.length)];
  const add = pool[Math.floor(c.rnd() * pool.length)];
  return { ...run, deck: run.deck.map(n => (n === out ? add : n)), swapped: { out, add } };
}

/* ---------- GACHA ---------- */
/** 1回の値段 (LUCKY COIN で 1 安い) */
export function gachaCost(run) {
  return GACHA_COST - (hasPatch(run, 'lucky') ? 1 : 0);
}
/** 引けるか (戦いの合間だけ) */
export function canPull(run) {
  return ['route', 'battle', 'reward'].includes(run.phase) && (run.credits | 0) >= gachaCost(run);
}
/* レア度を引き、そのレア度のパッチから1つ。持っているものが出たら「かぶり」でライフ +1 */
function pull(run, rnd) {
  let roll = rnd() * 100;
  let rar = 'C';
  for (const k of ['E', 'R', 'C']) { if (roll < RARITY[k].weight) { rar = k; break; } roll -= RARITY[k].weight; }
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

/* ---------- 進行 (すべて新しい状態を返す) ---------- */
export function newRun(names, rnd = Math.random, heat = 0) {
  const h = Math.max(0, Math.min(MAX_HEAT, heat | 0));
  const life = RUN_LIFE - (h >= 1 ? 1 : 0);
  return { v: 1, phase: 'draft', deck: [], life, maxLife: life, floor: 0, heat: h, patches: [], failsafeUsed: false, credits: 0, pulls: 0,
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
  if (drafted.heat >= 5) return startFloor(drafted, names, rnd);
  return { ...drafted, phase: 'patch', patchOffers: patchOffers(drafted, rnd), after: 'floor' };
}

/* パッチを選ぶ (id が null なら取らない)。そのあと、階の始まりか戦う前へ */
export function choosePatch(run, id, names, rnd = Math.random) {
  if (run.phase !== 'patch') return run;
  const got = id && (run.patchOffers || []).includes(id) ? addPatch(run, id) : run;
  const next = { ...got, patchOffers: [], pendingPatch: false };
  return run.after === 'battle' ? prepareFloor(next, names, rnd, next.route) : startFloor(next, names, rnd);
}

/* 階の始まり: 道を選べる階なら道の候補 (3つから2つ)、そうでなければそのまま戦う前へ */
export function startFloor(run, names, rnd = Math.random) {
  const f = FLOORS[run.floor];
  const fresh = { ...run, swapped: null, eventDone: null, lastSaved: false, lastPull: null };
  if (f && f.route) return { ...fresh, phase: 'route', routeOffers: sample(Object.keys(ROUTES), 2, rnd) };
  return prepareFloor(fresh, names, rnd, 'normal');
}

export function chooseRoute(run, route, names, rnd = Math.random) {
  if (run.phase !== 'route' || !(run.routeOffers || []).includes(route)) return run;
  if (route === 'event') {
    const id = Object.keys(EVENTS)[Math.floor(rnd() * Object.keys(EVENTS).length)];
    return { ...run, phase: 'event', event: id, route: 'normal', routeOffers: [] };
  }
  return prepareFloor({ ...run, routeOffers: [] }, names, rnd, route);
}

/* イベントの選択 */
export function resolveEvent(run, index, names, rnd = Math.random) {
  if (run.phase !== 'event') return run;
  const ev = EVENTS[run.event];
  const opt = ev && ev.options[index];
  if (!opt || (opt.need && !opt.need(run))) return run;
  const next = opt.apply({ ...run, eventDone: { id: run.event, choice: index } }, { names, rnd });
  if (next.phase === 'patch') return next;
  return prepareFloor({ ...next, event: null }, names, rnd, next.route || 'normal');
}

/* その階の相手を決めて、戦う前の状態にする。
   route: normal / elite (1段強い。勝つとパッチ) / alarm (保管庫の警報。1段強いだけ) */
export function prepareFloor(run, names, rnd = Math.random, route = 'normal') {
  const f = FLOORS[run.floor];
  const heat = run.heat | 0;
  const strong = route === 'elite' || route === 'alarm';
  let opp;
  if (f.boss) opp = { deck: STRONGEST_AI.slice(), level: 3, boss: true };
  else if (f.challenger || (route === 'elite' && heat >= 4)) {
    const i = Math.floor(rnd() * CHALLENGERS.length);
    opp = { deck: CHALLENGERS[i].deck.slice(), level: CHALLENGER_BASE + i };
  } else {
    let level = f.level;
    if (heat >= 2 && level === 1) level = 2;
    if (strong) level = Math.min(3, level + 1);
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
/* この回数でライフが尽きるか (FAILSAFE が残っていれば尽きない) */
export function lethal(run, compiles) {
  return damageOf(run, compiles) >= run.life && !(hasPatch(run, 'failsafe') && !run.failsafeUsed);
}

/* 1戦の結果。compiles = その試合で相手にコンパイルされた回数 */
export function finishBattle(run, win, compiles, names, rnd = Math.random) {
  if (run.phase !== 'battle') return run;
  const damage = damageOf(run, compiles);
  let life = run.life - damage;
  let failsafeUsed = run.failsafeUsed;
  let saved = false;
  if (life <= 0 && hasPatch(run, 'failsafe') && !failsafeUsed) { life = 1; failsafeUsed = true; saved = true; }
  /* クレジット: 勝つと +1、精鋭戦・警報の相手は +2、1回もコンパイルされずに勝つと +1、JACKPOT で +1 */
  let credits = run.credits | 0;
  if (win) {
    credits += run.route === 'elite' || run.route === 'alarm' ? 2 : 1;
    if ((compiles | 0) === 0) credits += 1;
    if (hasPatch(run, 'jackpot')) credits += 1;
  }
  if (win && life > 0) {
    if (hasPatch(run, 'repair')) life += 1;
    if (hasPatch(run, 'sweep') && (compiles | 0) === 0) life += 2;
    life = Math.min(run.maxLife, life);
  }
  const history = run.history.concat({ floor: run.floor, win: !!win, damage, opp: run.opp.deck, route: run.route || 'normal', saved });
  const base = { ...run, life, history, failsafeUsed, lastSaved: saved, credits, lastPull: null };
  let next;
  if (life <= 0) next = { ...base, life: 0, phase: 'over' };
  else if (!win) next = base;                                          // 同じ階をやり直す (相手もそのまま)
  else if (run.floor + 1 >= FLOORS.length) next = { ...base, floor: run.floor + 1, phase: 'clear' };
  else {
    next = { ...base, floor: run.floor + 1, phase: 'reward', pendingPatch: !!run.opp.elite,
      offers: sample(names.filter(n => !run.deck.includes(n)), hasPatch(run, 'search') ? 4 : 3, rnd) };
  }
  if (next.phase === 'over' || next.phase === 'clear') saveBest(next);
  if (next.phase === 'clear') unlockHeat(next.heat | 0);
  return next;
}

/** 回復の報酬の量 (HEAT 3 から +1) */
export function healAmount(run) {
  return (run.heat | 0) >= 3 ? 1 : RUN_HEAL;
}

/* 報酬: { type: 'swap', add, remove } / { type: 'heal' } / { type: 'skip' }。精鋭戦に勝ったあとはパッチを選ぶ */
export function applyReward(run, choice, names, rnd = Math.random) {
  if (run.phase !== 'reward') return run;
  let next = run;
  if (choice.type === 'swap' && run.offers.includes(choice.add) && run.deck.includes(choice.remove)) {
    next = { ...run, deck: run.deck.map(n => (n === choice.remove ? choice.add : n)) };
  } else if (choice.type === 'heal') {
    next = { ...run, life: Math.min(run.maxLife, run.life + healAmount(run)) };
  }
  if (run.pendingPatch) {
    const offers = patchOffers(next, rnd);
    if (offers.length) return { ...next, offers: [], phase: 'patch', patchOffers: offers, after: 'floor' };
  }
  return startFloor({ ...next, offers: [] }, names, rnd);
}

/* 試合のはじめ方 (パッチの効果)。me = 自分の席 */
export function battleOpts(run, me) {
  const other = 1 - me;
  const hand = [5, 5];
  if (hasPatch(run, 'cache')) hand[me] = 6;
  if (hasPatch(run, 'jammer')) hand[other] = 4;
  return {
    winCompiles: RUN_WIN_COMPILES,
    handSize: hand,
    ...(hasPatch(run, 'initiative') ? { first: me } : {}),
    ...(hasPatch(run, 'root') ? { startControl: me } : {})
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
