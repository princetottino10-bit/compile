/* =========================================================================
 * リプレイの共有: 棋譜 (始めの条件 + 指した手の列) を圧縮してリンクに詰める。サーバーには置かない。
 *   リンクは <ページ>#rp=<符号>。# の後ろはサーバーに送られないので、棋譜がアクセスの記録に残らない。
 *   符号: 先頭 1 文字が形式 ('z' = deflate-raw で圧縮 / 'j' = 圧縮なし。CompressionStream の無いブラウザ用) +
 *   base64url。1 戦でおよそ 800〜1000 文字。
 *   開く側では、中身をそのまま信じない (形を確かめ、展開後の大きさにも上限を付ける)
 * ========================================================================= */

export const SHARE_KEY = 'rp';
const MAX_JSON = 300 * 1024;          // 展開後の上限 (1 戦 5〜10KB。圧縮爆弾よけ)
const MAX_ACTIONS = 6000;

function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipeBytes(bytes, stream, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (limit && total > limit) { try { await reader.cancel(); } catch (e) { /* 止めるだけ */ } throw new Error('too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* 共有に載せる項目だけにする (保存用の id・★・日時以外の内部の印は載せない) */
export function sharePayload(rep) {
  return { v: 1, me: rep.me, opp: rep.opp, win: !!rep.win, level: rep.level, turns: rep.turns, kind: rep.kind,
    at: rep.at, init: rep.init, actions: rep.actions, ...(rep.view === 1 ? { view: 1 } : {}) };
}

export async function encodeReplay(rep) {
  const bytes = new TextEncoder().encode(JSON.stringify(sharePayload(rep)));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + toB64url(await pipeBytes(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* 圧縮できなければそのまま */ }
  }
  return 'j' + toB64url(bytes);
}

const isStrList = (a, n) => Array.isArray(a) && a.length === n && a.every(x => typeof x === 'string' && /^[A-Z_]{2,20}$/.test(x));

/* 開いたリンクの中身を確かめて、リプレイの形にする。おかしければ null。
   protoNames: 実在するプロトコル名 (知らない名前の盤面は作らない) */
export function validateReplay(r, protoNames) {
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  const i = r.init;
  if (!i || typeof i !== 'object' || !Number.isFinite(i.seed)) return null;
  if (!isStrList(i.p0, 3) || !isStrList(i.p1, 3)) return null;
  if (protoNames && ![...i.p0, ...i.p1].every(n => protoNames.includes(n))) return null;
  if (!Array.isArray(r.actions) || r.actions.length > MAX_ACTIONS) return null;
  if (!r.actions.every(a => a && typeof a === 'object' && typeof a.type === 'string')) return null;
  return {
    me: (r.view === 1 ? i.p1 : i.p0).slice(), opp: (r.view === 1 ? i.p0 : i.p1).slice(), win: !!r.win,
    level: Number.isFinite(r.level) ? r.level : 0,
    turns: Number.isFinite(r.turns) ? r.turns : 0,
    kind: typeof r.kind === 'string' ? r.kind.slice(0, 12) : 'cpu',
    at: Number.isFinite(r.at) ? r.at : Date.now(),
    init: i, actions: r.actions, shared: true, view: r.view === 1 ? 1 : 0
  };
}

export async function decodeReplay(code, protoNames) {
  try {
    if (typeof code !== 'string' || code.length < 2 || code.length > 200000) return null;
    const kind = code[0], bytes = fromB64url(code.slice(1));
    let json;
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') return null;
      json = await pipeBytes(bytes, new DecompressionStream('deflate-raw'), MAX_JSON);
    } else if (kind === 'j') {
      if (bytes.length > MAX_JSON) return null;
      json = bytes;
    } else return null;
    return validateReplay(JSON.parse(new TextDecoder().decode(json)), protoNames);
  } catch (e) {
    return null;
  }
}

/* 共有リンク (ページの場所 + #rp=符号) */
export function replayShareUrl(code, loc = location) {
  return loc.origin + loc.pathname + '#' + SHARE_KEY + '=' + code;
}
/* いま開いているリンクの符号 (無ければ null) */
export function sharedCodeFromHash(hash = location.hash) {
  const m = /^#rp=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? m[1] : null;
}

/* 端末の共有メニュー (無ければクリップボード) でリンクを渡す。返り値 'shared' | 'copied' | 'failed' */
export async function shareReplayLink(rep, title) {
  let url;
  try { url = replayShareUrl(await encodeReplay(rep)); } catch (e) { return 'failed'; }
  const text = title || 'COMPILE のリプレイ';
  if (navigator.share) {
    try { await navigator.share({ title: text, text, url }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch (e) { return 'failed'; }
}
