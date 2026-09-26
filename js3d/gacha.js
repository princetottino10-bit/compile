/* =========================================================================
 * COSMETICS のガチャ (勝ち抜き戦の外で回すもの)
 *   ・CHIP で回す。CHIP = これまでに貯めた経験値の合計 − 使った分
 *     (経験値の帳簿と戦績はアカウントにも残るので、別の端末でも同じだけ貯まっている)
 *   ・出るのはガチャでしか取れない見た目と称号 (rewards.js の GACHA_ITEMS)。
 *     COMMON 55% / RARE 30% / EPIC 12% / LEGENDARY 3%
 *   ・1回 10 CHIP、10連 90 CHIP (RARE 以上が1つは出る)。
 *     EPIC 以上が9回続けて出なかったら、10回目は EPIC 以上 (天井)
 *   ・持っているものが出たら CHIP を少し返す (かぶり)
 *   保存は compileGacha { spent, owned: { 'kind:key': 時刻 }, pulls, pity }。アカウントの保存 (cloudsave.js) にも入る
 * ========================================================================= */
import { GACHA_ITEMS, gachaId, itemName } from './rewards.js';

const KEY = 'compileGacha';
/* 1回 30 (数試合に1回の楽しみ)。10連は 1回ぶん安い */
export const PULL_COST = 30;
export const TEN_COST = 270;
export const PITY = 10;
export const RATES = { C: 55, R: 30, E: 12, L: 3 };
export const REFUND = { C: 6, R: 9, E: 18, L: 36 };

export function loadGacha() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      return { spent: Math.max(0, s.spent | 0), owned: s.owned && typeof s.owned === 'object' ? s.owned : {}, pulls: s.pulls | 0, pity: s.pity | 0 };
    }
  } catch (e) { /* 壊れていれば空から */ }
  return { spent: 0, owned: {}, pulls: 0, pity: 0 };
}
function saveGacha(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

/** 使える CHIP (earned = 貯めた経験値の合計) */
export function chipsOf(state, earned) {
  return Math.max(0, (earned | 0) - state.spent);
}

function rollRarity(rnd, floor) {
  let x = rnd() * 100;
  let rar = 'C';
  for (const k of ['L', 'E', 'R', 'C']) { if (x < RATES[k]) { rar = k; break; } x -= RATES[k]; }
  const order = ['C', 'R', 'E', 'L'];
  if (floor && order.indexOf(rar) < order.indexOf(floor)) {
    /* 下限より低ければ、下限以上の中から重みどおりに引き直す */
    const pool = order.slice(order.indexOf(floor));
    const total = pool.reduce((n, k) => n + RATES[k], 0);
    let y = rnd() * total;
    for (const k of pool.slice().reverse()) { if (y < RATES[k]) return k; y -= RATES[k]; }
    return floor;
  }
  return rar;
}

/* 1つ引く (純粋な計算)。floor: このレア度以上を確定 */
function drawOne(state, rnd, floor) {
  const pityHit = state.pity + 1 >= PITY;
  const rar = rollRarity(rnd, pityHit ? 'E' : floor);
  /* 同じレア度の中で、まだ持っていない物から出す。全部持っていれば、かぶり (CHIP を返す) */
  const pool = GACHA_ITEMS.filter(g => g.rar === rar);
  const fresh = pool.filter(g => !state.owned[gachaId(g.kind, g.key)]);
  const from = fresh.length ? fresh : pool;
  const item = from[Math.floor(rnd() * from.length)];
  const id = gachaId(item.kind, item.key);
  const dupe = !!state.owned[id];
  const refund = dupe ? REFUND[rar] : 0;
  const next = {
    ...state,
    owned: dupe ? state.owned : { ...state.owned, [id]: Date.now() },
    spent: state.spent - refund,
    pulls: state.pulls + 1,
    pity: rar === 'E' || rar === 'L' ? 0 : state.pity + 1
  };
  return { state: next, result: { kind: item.kind, key: item.key, rar, dupe, refund, name: itemName(item.kind, item.key), pity: pityHit } };
}

/**
 * 引く (純粋な計算)。count は 1 か 10。CHIP が足りなければ null。
 * @returns {{ state, results } | null}
 */
export function pull(state, earned, count, rnd = Math.random) {
  const cost = count === 10 ? TEN_COST : PULL_COST;
  if (chipsOf(state, earned) < cost) return null;
  let s = { ...state, spent: state.spent + cost };
  const results = [];
  for (let i = 0; i < (count === 10 ? 10 : 1); i++) {
    /* 10連の最後は、それまで RARE 以上が無ければ RARE 以上 */
    const floor = count === 10 && i === 9 && results.every(r => r.rar === 'C') ? 'R' : null;
    const r = drawOne(s, rnd, floor);
    s = r.state;
    results.push(r.result);
  }
  return { state: s, results };
}

/** ブラウザの保存を読み書きして引く */
export function pullAndSave(earned, count, rnd = Math.random) {
  const r = pull(loadGacha(), earned, count, rnd);
  if (r) saveGacha(r.state);
  return r;
}

/** 図鑑: [{ kind, key, rar, name, owned }] と、そろえた数 */
export function collection(state = loadGacha()) {
  const list = GACHA_ITEMS.map(g => ({ ...g, name: itemName(g.kind, g.key), owned: !!state.owned[gachaId(g.kind, g.key)] }));
  return { list, got: list.filter(x => x.owned).length, total: list.length };
}

/* アカウントの保存を合わせるとき: 取ったものは両方残し、使った CHIP と回数は多い方 (かぶりで返した分は少ない方に寄るが、増えすぎない側に倒す) */
export function mergeGacha(a, b) {
  try {
    const x = JSON.parse(a || 'null') || {}, y = JSON.parse(b || 'null') || {};
    const owned = { ...(y.owned || {}) };
    for (const [k, v] of Object.entries(x.owned || {})) owned[k] = owned[k] ? Math.min(owned[k], v) : v;
    return JSON.stringify({ spent: Math.max(x.spent | 0, y.spent | 0), owned, pulls: Math.max(x.pulls | 0, y.pulls | 0), pity: Math.max(x.pity | 0, y.pity | 0) });
  } catch (e) {
    return a || b;
  }
}
