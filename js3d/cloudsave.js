/* =========================================================================
 * 戦績・経験値以外のブラウザの保存 (設定・見た目・お気に入り・RUN・WEEKLY など) を
 * 1つにまとめて、アカウントの1行 (player_saves) と行き来させる。
 *   1人1行・数KB なので、通信も保存量も小さい。
 *   どちらが新しいか: 最後に同期したあと、このブラウザで変わっていればこちらを送る。
 *   変わっていなくてアカウントの方が新しければ、アカウントの方を読む。
 *   RUN の最高記録だけは、どちらが勝っても良い方を残す。
 *   ここは通信しない (account.js が読み書きを受け持つ)
 * ========================================================================= */

/* まとめて保存する項目。一時的な印 (ログインから戻った印など) は入れない */
export const SAVE_KEYS = ['compileSettings', 'compileFavCards', 'compileRun', 'compileRunBest', 'compileRunKind',
  'compileWeekly', 'compileOppLast', 'compileDaily', 'compileTrophies', 'compileRoomName'];
const META = 'compileCloudMeta';     // { user, hash: 最後に同期した中身, at: そのときのアカウント側の時刻 }
const MAX_BYTES = 60000;

const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

/* いまのブラウザの中身 { key: 文字列 } (無い項目は入れない) */
export function snapshot() {
  const out = {};
  for (const k of SAVE_KEYS) {
    const v = read(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

/* 中身が同じかを見分ける短い印 (順番をそろえてから) */
export function hashOf(data) {
  const s = JSON.stringify(SAVE_KEYS.filter(k => k in data).map(k => [k, data[k]]));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + ':' + s.length;
}

export function loadMeta(user) {
  try {
    const m = JSON.parse(read(META) || 'null');
    return m && m.user === user ? m : null;
  } catch (e) {
    return null;
  }
}
export function saveMeta(user, hash, at) { write(META, JSON.stringify({ user, hash, at })); }

/* アカウントから来た中身を、知っている項目・文字列・大きさで絞る */
export function cleanRemote(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const k of SAVE_KEYS) if (typeof data[k] === 'string' && data[k].length < MAX_BYTES) out[k] = data[k];
  return out;
}

/* RUN の最高記録は良い方 (到達した階が深い方、同じならライフが多い方。run.js の saveBest と同じ比べ方) */
function betterBest(a, b) {
  try {
    const x = JSON.parse(a) || {}, y = JSON.parse(b) || {};
    const rx = Number(x.reached) || 0, ry = Number(y.reached) || 0;
    return ry > rx || (ry === rx && (Number(y.life) || 0) > (Number(x.life) || 0)) ? b : a;
  } catch (e) {
    return a || b;
  }
}

/* 実績は取ったものを両方残す (どちらかで取れば取ったまま)。時刻は早い方 */
function unionTrophies(a, b) {
  try {
    const x = JSON.parse(a || '{}') || {}, y = JSON.parse(b || '{}') || {};
    const out = { ...y };
    for (const [k, v] of Object.entries(x)) out[k] = out[k] ? Math.min(out[k], v) : v;
    return JSON.stringify(out);
  } catch (e) {
    return a || b;
  }
}
/* どちらを正にしても、残すべきもの (RUN の最高記録・実績) は合わせる */
function keepBest(merged, local, rd) {
  if (local.compileRunBest && rd.compileRunBest) merged.compileRunBest = betterBest(local.compileRunBest, rd.compileRunBest);
  else if (rd.compileRunBest && !merged.compileRunBest) merged.compileRunBest = rd.compileRunBest;
  if (local.compileTrophies || rd.compileTrophies) merged.compileTrophies = unionTrophies(local.compileTrophies, rd.compileTrophies);
  return merged;
}

/* 同期の中身を決める。
   local: いまのブラウザ、remote: アカウントの行 ({ data, at } / 無ければ null)、meta: 前回の同期
   返り値 { apply: ブラウザに書く中身 or null, push: アカウントに送る中身 or null } */
export function decide(local, remote, meta) {
  const localChanged = !meta || hashOf(local) !== meta.hash;
  if (!remote) return { apply: null, push: Object.keys(local).length ? local : null };
  const rd = cleanRemote(remote.data);
  const remoteNewer = !meta || remote.at > meta.at;
  if (!meta) {
    /* この端末で初めての同期: アカウントの中身を正にし、アカウントに無い項目だけこちらのを足す */
    const merged = keepBest({ ...local, ...rd }, local, rd);
    const same = hashOf(merged) === hashOf(rd);
    return { apply: hashOf(merged) === hashOf(local) ? null : merged, push: same ? null : merged };
  }
  if (localChanged) {
    const merged = keepBest({ ...local }, local, rd);
    return { apply: hashOf(merged) === hashOf(local) ? null : merged, push: merged };
  }
  return { apply: remoteNewer && hashOf(rd) !== hashOf(local) ? rd : null, push: null };
}

/* ブラウザに書く。apply に無い項目は消す (アカウント側で消えたものに合わせる) */
export function applySnapshot(data) {
  for (const k of SAVE_KEYS) write(k, k in data ? data[k] : null);
}
