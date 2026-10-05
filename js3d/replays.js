/* =========================================================================
 * リプレイ (CPU 戦の棋譜の保存と再現)
 *   盤面を丸ごと残すと重いので、「始めの条件 (種・プロトコル・先手) + 指した手の列」だけを残す。
 *   エンジンの乱数は盤面の種から決まるので、同じ手を順に当て直せば同じ試合になる。
 *   直近 RECENT 戦は自動で残し (オンライン・観戦・それ以外で枠を分ける)、SAVE を押した試合は PINNED 戦まで別に残す。
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

/* 自動で残す枠の分け方: オンライン・観戦・それ以外 (CPU 戦・勝ち抜き・週替わり) で別々に RECENT 戦ずつ。
   1つの枠だと、CPU 戦を続けて遊ぶうちに、めったにないオンラインの対戦が押し出されて消えていた */
export function poolOf(r) {
  return r && r.kind === 'online' ? 'online' : r && r.kind === 'watch' ? 'watch' : 'local';
}

/* 残す数に切り詰める: 保存したものは全部、ほかは枠ごとに新しい順に RECENT 戦 */
export function trim(list) {
  const pinned = list.filter(r => r.pinned);
  const recent = [];
  for (const pool of ['local', 'online', 'watch']) {
    recent.push(...list.filter(r => !r.pinned && poolOf(r) === pool).sort((a, b) => b.at - a.at).slice(0, RECENT));
  }
  return pinned.concat(recent).sort((a, b) => b.at - a.at);
}

/* 一覧の絞り込みに使う種類: cpu / online / run / weekly / watch */
export function kindOf(r) {
  const k = r && r.kind;
  return k === 'online' || k === 'run' || k === 'weekly' || k === 'watch' ? k : 'cpu';
}

/* 絞り込み。f: { kind: 'all' | kindOf の値, result: 'all' | 'win' | 'lose' } */
export function filterReplays(list, f) {
  const kind = (f && f.kind) || 'all', result = (f && f.result) || 'all';
  return list.filter(r => (kind === 'all' || kindOf(r) === kind) && (result === 'all' || (result === 'win') === !!r.win));
}

export const LONG_TURNS = 36;      // 長期戦の目安 (両者の手番の合計)
/* 手元にある数字だけで付ける印 (重い計算はしない)。
   接戦: 負けた側があと1本 (コンパイルの数が1つ差)。長期戦: 手番が LONG_TURNS 以上。
   大逆転: 感想戦を開いたときに、勝った側が大きく不利だった場面があった (noteReplayFacts で残した印) */
export function replayTags(r) {
  const tags = [];
  if (!r) return tags;
  if (r.comeback) tags.push('大逆転');
  const s = r.score;
  if (Array.isArray(s) && s.length === 2 && Math.max(s[0], s[1]) - Math.min(s[0], s[1]) === 1 && Math.min(s[0], s[1]) >= 1) tags.push('接戦');
  if (Number.isFinite(r.turns) && r.turns >= LONG_TURNS) tags.push('長期戦');
  if (r.fromShare) tags.push('共有から');
  return tags;
}

/* 自分で付けた名前 (40 文字まで。空なら外す) */
export function setReplayTitle(id, title) {
  const t = String(title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  const list = load();
  if (!list.some(r => r.id === id)) return false;
  return save(list.map(r => {
    if (r.id !== id) return r;
    const { title: _old, ...rest } = r;
    return t ? { ...rest, title: t } : rest;
  }));
}

/* 感想戦で分かったこと (大逆転など) を残す。facts: { comeback: true } など */
export function noteReplayFacts(id, facts) {
  const list = load();
  const r = list.find(x => x.id === id);
  if (!r || !facts) return false;
  const next = { ...r, ...facts };
  if (JSON.stringify(next) === JSON.stringify(r)) return true;
  return save(list.map(x => (x.id === id ? next : x)));
}

/* 優勢の推移 (自分から見て -1..1) から「大逆転」かを決める: 勝った側が一度でも LIMIT より不利だった */
export const COMEBACK_LIMIT = 0.5;
export function isComeback(adv, win) {
  if (!Array.isArray(adv) || adv.length < 2) return false;
  return win ? Math.min(...adv) <= -COMEBACK_LIMIT : Math.max(...adv) >= COMEBACK_LIMIT;
}

/* レート戦の記録 (オンラインの戦績) に合う、手元のリプレイを探す。
   サーバーの記録には部屋のコードが無いので、相手の名前・プロトコル・終わった時刻 (前後 15 分) で合わせる */
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
export function findMatchReplay(list, m) {
  if (!m) return null;
  const end = Date.parse(m.endedAt);
  return list.find(r => r.kind === 'online' && sameSet(r.me, m.myProtocols) && sameSet(r.opp, m.opponentProtocols) &&
    (!r.oppName || !m.opponent || r.oppName === m.opponent) && Number.isFinite(end) && Math.abs(r.at - end) < 15 * 60_000) || null;
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
    handSize: i.handSize, startControl: i.startControl, exclude: i.exclude, deckMods: i.deckMods, winCompilesBySide: i.winCompilesBySide, perks: i.perks, startCompiled: i.startCompiled });   // 勝ち抜き戦のパッチ・カード除去で変わったはじめ方
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
  /* view 1: オンラインで後攻の部屋 (ゲスト) にいた人の棋譜。盤面を左右入れ替えて、自分を手前にして見せる */
  if (rep.view === 1) {
    return { history: history.map(h => ({ st: mirrorState(h.st), action: mirrorAction(h.action) })), final: mirrorState(res.state), res, ok };
  }
  return { history, final: res.state, res, ok };
}

/* ---------- 盤面の左右の入れ替え (P1 と P2 を取り替える) ----------
   手を指す前の盤面 (選択待ちの途中ではないところ) を、側の番号だけ取り替えた同じ盤面にする。
   2回かけると元に戻る */
const flip = (v) => (v === 0 ? 1 : v === 1 ? 0 : v);
const swap2 = (a) => (Array.isArray(a) && a.length === 2 ? [a[1], a[0]] : a);
const flipBits = (k) => ((k || 0) & ~3) | ((k & 1) << 1) | ((k & 2) >> 1);
const flipZone = (z) => (typeof z === 'string' && /^(hand|deck|trash)[01]$/.test(z) ? z.slice(0, -1) + flip(+z.slice(-1)) : z);
const flipLog = (line) => (typeof line === 'string' ? line.replace(/\bP([12])\b/g, (m, n) => 'P' + (n === '1' ? '2' : '1')) : line);
const withPlayer = (o) => (o && typeof o === 'object' && 'player' in o ? { ...o, player: flip(o.player) } : o);

export function mirrorState(st) {
  if (!st) return st;
  const cards = {};
  for (const [uid, c] of Object.entries(st.cards || {})) {
    cards[uid] = { ...c, owner: flip(c.owner), zone: flipZone(c.zone), knownTo: flipBits(c.knownTo) };
  }
  const tally = st.tally ? Object.fromEntries(Object.entries(st.tally).map(([k, v]) => [k, swap2(v)])) : st.tally;
  return {
    ...st, cards, tally,
    turn: flip(st.turn), control: flip(st.control), winner: st.winner === null ? null : flip(st.winner),
    players: swap2(st.players),
    lines: (st.lines || []).map(swap2),
    ...('perks' in st ? { perks: swap2(st.perks) } : {}), ...('winBySide' in st ? { winBySide: swap2(st.winBySide) } : {}),
    revealed: withPlayer(st.revealed), announce: withPlayer(st.announce), pending: withPlayer(st.pending),
    actionLog: Array.isArray(st.actionLog) ? st.actionLog.map(flipLog) : st.actionLog
  };
}
export function mirrorAction(a) {
  if (!a || typeof a !== 'object') return a;
  const out = { ...a };
  if ('side' in out) out.side = flip(out.side);
  if ('player' in out) out.player = flip(out.player);
  return out;
}
