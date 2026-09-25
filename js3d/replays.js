/* =========================================================================
 * リプレイ (CPU 戦の棋譜の保存と再現)
 *   盤面を丸ごと残すと重いので、「始めの条件 (種・プロトコル・先手) + 指した手の列」だけを残す。
 *   エンジンの乱数は盤面の種から決まるので、同じ手を順に当て直せば同じ試合になる。
 *   直近 RECENT 戦は自動で残し、SAVE を押した試合は PINNED 戦まで別に残す。
 *   保存 (★) したものはログインしていればアカウントにも残す (1戦 5KB ほど。account.js が送る)
 * ========================================================================= */

const KEY = 'compileReplays';
/* アカウント連携 (account.js) が差し込む口: onPin(rep) / onUnpin(id) */
const hooks = { onPin: null, onUnpin: null };
export function setReplayHooks(h) { Object.assign(hooks, h); }
export const RECENT = 10;
export const PINNED = 30;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && Array.isArray(s.list) ? s.list.filter(r => r && r.id && r.init && Array.isArray(r.actions)) : [];
  } catch (e) {
    return [];
  }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, list })); return true; } catch (e) { return false; }
}

/* 残す数に切り詰める: 保存したものは全部、ほかは新しい順に RECENT 戦 */
export function trim(list) {
  const pinned = list.filter(r => r.pinned);
  const recent = list.filter(r => !r.pinned).sort((a, b) => b.at - a.at).slice(0, RECENT);
  return pinned.concat(recent).sort((a, b) => b.at - a.at);
}

export function listReplays() { return load().sort((a, b) => b.at - a.at); }
export function getReplay(id) { return load().find(r => r.id === id) || null; }

/* 1戦を残す。rep: { me, opp, win, level, turns, init: { seed, p0, p1, first, winCompiles }, actions } 。id を返す */
export function addReplay(rep, now = Date.now()) {
  const id = 'r' + now.toString(36) + Math.random().toString(36).slice(2, 5);
  let list = trim(load().concat({ ...rep, id, at: now, pinned: false }));
  /* 入りきらない (ブラウザの保存の上限) ときは古い自動保存から捨てる */
  while (!save(list)) {
    const drop = list.filter(r => !r.pinned).pop();
    if (!drop) return null;
    list = list.filter(r => r !== drop);
  }
  return id;
}

/* 保存する / やめる。{ ok, message } */
export function pinReplay(id, on) {
  const list = load();
  if (on && list.filter(r => r.pinned).length >= PINNED) return { ok: false, message: '保存できるのは ' + PINNED + ' 戦までです。どれかを外してください' };
  const next = trim(list.map(r => (r.id === id ? { ...r, pinned: !!on } : r)));
  if (!save(next)) return { ok: false, message: 'ブラウザの保存がいっぱいです' };
  const r = next.find(x => x.id === id);
  if (on && r && hooks.onPin) hooks.onPin(r);
  if (!on && hooks.onUnpin) hooks.onUnpin(id);
  return { ok: true };
}

export function deleteReplay(id) {
  const was = load().find(r => r.id === id);
  save(load().filter(r => r.id !== id));
  if (was && was.pinned && hooks.onUnpin) hooks.onUnpin(id);
}

export function pinnedReplays() { return load().filter(r => r.pinned); }

/* アカウントにある保存済みを取り込む (同じ id は足さない)。足した数を返す */
export function mergeReplays(remote) {
  const list = load();
  const have = new Set(list.map(r => r.id));
  const add = (remote || []).filter(r => r && r.id && r.init && Array.isArray(r.actions) && !have.has(r.id)).map(r => ({ ...r, pinned: true }));
  if (!add.length) return 0;
  return save(trim(list.concat(add))) ? add.length : 0;
}

/* 棋譜から試合を作り直す (純粋な計算。Engine を渡す)。
   返り値 { history: [{ st: 指す前の盤面, action }] (カードを出す・リフレッシュの手だけ), final, res, ok } 。
   途中で当てはまらない手があれば ok: false (そこまでの盤面で止める) */
export function rebuild(Engine, rep) {
  const i = rep.init;
  let res = Engine.newGame({ seed: i.seed, p0: i.p0, p1: i.p1, first: i.first, winCompiles: i.winCompiles || undefined,
    handSize: i.handSize, startControl: i.startControl, exclude: i.exclude });   // 勝ち抜き戦のパッチ・カード除去で変わったはじめ方
  const history = [];
  let ok = !res.error;
  for (const action of rep.actions) {
    if (!ok) break;
    const before = res.state;
    const next = Engine.apply(before, action);
    if (next.error) { ok = false; break; }
    if (action.type === 'play' || action.type === 'refresh') history.push({ st: before, action });
    res = next;
  }
  return { history, final: res.state, res, ok };
}
