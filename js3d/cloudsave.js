/* =========================================================================
 * 戦績・経験値以外のブラウザの保存 (設定・見た目・お気に入り・RUN・WEEKLY など) を
 * 1つにまとめて、アカウントの1行 (player_saves) と行き来させる。
 *   1人1行・数KB なので、通信も保存量も小さい。
 *   どちらが新しいか: 最後に同期したあと、このブラウザで変わっていればこちらを送る。
 *   変わっていなくてアカウントの方が新しければ、アカウントの方を読む。
 *   RUN の最高記録だけは、どちらが勝っても良い方を残す。
 *   ここは通信しない (account.js が読み書きを受け持つ)
 * ========================================================================= */

import { mergeGacha } from './gacha.js';

/* まとめて保存する項目。一時的な印 (ログインから戻った印など) は入れない */
import { mergeStory } from './story.js';

export const SAVE_KEYS = ['compileSettings', 'compileRun', 'compileRunBest', 'compileRunHeat', 'compileRunKind',
  'compileWeekly', 'compileOppLast', 'compileDaily', 'compileTrophies', 'compileRoomName', 'compileGacha', 'compileStory'];
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
    const hx = Number(x.heat) || 0, hy = Number(y.heat) || 0;           // HEAT (難しさ) が高い方を先に比べる
    if (hx !== hy) return hy > hx ? b : a;
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
/* 週替わり3連戦・RUN の途中経過は、進んでいる方を残す。
   対戦中に同期が走ってアカウントの古い中身 (前の挑戦の「負け」など) を書くと、決着のときに「対戦中」でなくなって勝ちが消えていた */
const parse = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };
const WEEK_PHASE = { idle: 0, choose: 1, battle: 2, lost: 3, clear: 4 };
function weeklyRank(w) {
  return w ? [String(w.week || ''), w.attempt | 0, w.stage | 0, WEEK_PHASE[w.phase] | 0] : null;
}
function runRank(r) {
  return r ? [Number(r.startedAt) || 0, r.rev | 0, (r.history || []).length, (r.visited || []).length] : null;
}
function cmp(x, y) {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
/* 進んでいる方の文字列を返す (同じなら a)。読めない方は選ばない */
function further(a, b, rank) {
  const ra = a ? rank(parse(a)) : null, rb = b ? rank(parse(b)) : null;
  if (!rb) return a;
  if (!ra) return b;
  return cmp(rb, ra) > 0 ? b : a;
}
function mergeDaily(a, b) {
  const x = parse(a), y = parse(b);
  if (!x || !y) return x ? a : b;
  if ((x.day | 0) !== (y.day | 0)) return (y.day | 0) > (x.day | 0) ? b : a;
  const progress = { ...(y.progress || {}) };
  for (const [k, v] of Object.entries(x.progress || {})) progress[k] = Math.max(progress[k] || 0, v || 0);
  const done = [...new Set([...(x.done || []), ...(y.done || [])])];
  return JSON.stringify({ ...x, ...y, progress, done });
}
function mergeWeekly(a, b) {
  const pick = further(a, b, weeklyRank);
  const x = parse(a), y = parse(b), p = parse(pick);
  if (!p || !x || !y || x.week !== y.week) return pick;
  /* 同じ週なら、クリア回数・最高到達・名前を載せたかは多い方 */
  return JSON.stringify({ ...p, clears: Math.max(x.clears | 0, y.clears | 0), bestStage: Math.max(x.bestStage | 0, y.bestStage | 0),
    submitted: !!(x.submitted || y.submitted) });
}

/* どちらを正にしても、残すべきもの (RUN の最高記録・実績) は合わせる */
function keepBest(merged, local, rd) {
  /* ストーリーの進み具合: クリアした場面を足し合わせる (「最初から」より前のものは足さない。story.js の mergeStory) */
  if (local.compileStory && rd.compileStory) {
    try { merged.compileStory = JSON.stringify(mergeStory(JSON.parse(local.compileStory), JSON.parse(rd.compileStory))); } catch (e) { /* 壊れた中身はそのまま */ }
  }
  if (local.compileWeekly || rd.compileWeekly) merged.compileWeekly = local.compileWeekly && rd.compileWeekly ? mergeWeekly(local.compileWeekly, rd.compileWeekly) : (merged.compileWeekly || local.compileWeekly || rd.compileWeekly);
  if (local.compileRun && rd.compileRun) merged.compileRun = further(local.compileRun, rd.compileRun, runRank);
  if (local.compileDaily && rd.compileDaily) merged.compileDaily = mergeDaily(local.compileDaily, rd.compileDaily);
  /* 解放した HEAT は大きい方 */
  if (local.compileRunHeat || rd.compileRunHeat) merged.compileRunHeat = String(Math.max(parseInt(local.compileRunHeat, 10) || 0, parseInt(rd.compileRunHeat, 10) || 0));
  if (local.compileRunBest && rd.compileRunBest) merged.compileRunBest = betterBest(local.compileRunBest, rd.compileRunBest);
  else if (rd.compileRunBest && !merged.compileRunBest) merged.compileRunBest = rd.compileRunBest;
  if (local.compileTrophies || rd.compileTrophies) merged.compileTrophies = unionTrophies(local.compileTrophies, rd.compileTrophies);
  /* ガチャで取った見た目は両方残す。使った CHIP は多い方 (増やしすぎない) */
  if (local.compileGacha || rd.compileGacha) merged.compileGacha = mergeGacha(local.compileGacha, rd.compileGacha);
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
  if (!remoteNewer || hashOf(rd) === hashOf(local)) return { apply: null, push: null };
  /* アカウントの方が新しい: 読む。ただし途中経過は進んでいる方 (こちらの方が進んでいれば送り返す) */
  const merged = keepBest({ ...rd }, local, rd);
  return { apply: hashOf(merged) === hashOf(local) ? null : merged, push: hashOf(merged) === hashOf(rd) ? null : merged };
}

/* 上書きする前のこの端末の中身を控えておく (1つだけ。上書きのたびに新しくする) */
export function backupLocal(local) {
  try { localStorage.setItem('compileSaveBackup', JSON.stringify({ at: Date.now(), data: local })); } catch (e) { /* 容量不足・private mode */ }
}

/* ブラウザに書く。apply に無い項目は消す (アカウント側で消えたものに合わせる) */
export function applySnapshot(data) {
  for (const k of SAVE_KEYS) write(k, k in data ? data[k] : null);
}
