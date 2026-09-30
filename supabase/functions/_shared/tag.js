/* =========================================================================
 * オンラインのタッグ戦 (2対2) の席と手番。secure-room (サーバー) が使い、test/tag-room.test.js が確かめる。
 *   席は4つ [A1, B1, A2, B2]。手番もこの順に回る (エンジンのタッグと同じ)。
 *   席の番号 i → 側 (チーム) = i % 2、何人目 (pilot) = floor(i / 2)。
 *   席: null (空き) / { uid, name, badge, look, protocols, cpu: false } (人) / { cpu: true, name, protocols } (CPU)
 *   どの関数も元の席を変えずに、新しい並びを返す
 * ========================================================================= */

export const SEATS = 4;
export const seatSide = (i) => i % 2;
export const seatPilot = (i) => Math.floor(i / 2);
export const seatIndex = (side, pilot) => side + 2 * pilot;
export const isHuman = (x) => !!(x && !x.cpu && x.uid);
export const humans = (seats) => seats.filter(isHuman);
const cpuSeat = () => ({ cpu: true, name: 'CPU', protocols: null });

export function blankSeats(host) {
  return [{ ...host, protocols: null, cpu: false }, null, null, null];
}
export const seatOf = (seats, uid) => seats.findIndex(x => isHuman(x) && x.uid === uid);

/* 入る: 人の少ないチームの空き席 (同じなら前の席) */
export function joinSeat(seats, user) {
  if (seatOf(seats, user.uid) >= 0) return seats;
  const open = [0, 1, 2, 3].filter(i => !seats[i]);
  if (!open.length) return seats;
  const people = (side) => [0, 1, 2, 3].filter(i => seatSide(i) === side && isHuman(seats[i])).length;
  open.sort((a, b) => people(seatSide(a)) - people(seatSide(b)) || a - b);
  const out = seats.slice();
  out[open[0]] = { ...user, protocols: null, cpu: false };
  return out;
}
export function leaveSeat(seats, uid) {
  const i = seatOf(seats, uid);
  if (i < 0) return seats;
  const out = seats.slice();
  out[i] = null;
  return out;
}
/* 席を移る: 空き席か CPU の席へ (CPU は外れる) */
export function moveSeat(seats, uid, to) {
  const from = seatOf(seats, uid);
  if (from < 0 || to < 0 || to >= SEATS || from === to || isHuman(seats[to])) return seats;
  const out = seats.slice();
  out[to] = out[from];
  out[from] = null;
  return out;
}
/* 空き ⇔ CPU (人の席は変えない) */
export function setCpu(seats, i, on) {
  if (i < 0 || i >= SEATS || isHuman(seats[i])) return seats;
  const out = seats.slice();
  out[i] = on ? cpuSeat() : null;
  return out;
}
/* よく使う形。coop = 人はチーム A (相手は CPU)、duel = 人は別々のチーム (味方は CPU)、shuffle = 人をランダムな席へ */
export function preset(seats, kind, rnd = Math.random) {
  const people = humans(seats);
  const order = kind === 'coop' ? [0, 2, 1, 3] : kind === 'duel' ? [0, 1, 2, 3]
    : [0, 1, 2, 3].map(i => [rnd(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const out = [null, null, null, null];
  people.forEach((p, k) => { out[order[k]] = p; });
  /* coop・duel は空いた席を CPU で埋める。shuffle は CPU の数をそのまま残す (人の席の残りへ) */
  const cpus = kind === 'coop' || kind === 'duel' ? SEATS - people.length : seats.filter(x => x && x.cpu).length;
  let left = cpus;
  for (let i = 0; i < SEATS && left > 0; i++) {
    if (!out[i]) { out[i] = cpuSeat(); left--; }
  }
  return out;
}
export const canStart = (seats) => seats.every(Boolean) && humans(seats).length >= 2;

/* プロトコル: 3つ・重なりなし・味方と重ならない (相手チームとは重なってよい) */
const mateOf = (i) => (i + 2) % SEATS;
export function pickProtocols(seats, uid, protos, all) {
  const i = seatOf(seats, uid);
  if (i < 0) throw new Error('席に座っていません');
  if (!Array.isArray(protos) || protos.length !== 3 || new Set(protos).size !== 3) throw new Error('プロトコルを3つ選んでください');
  if (!protos.every(p => all.includes(p))) throw new Error('知らないプロトコルです');
  const mate = seats[mateOf(i)];
  if (mate && mate.protocols && protos.some(p => mate.protocols.includes(p))) throw new Error('味方と同じプロトコルは選べません');
  const out = seats.slice();
  out[i] = { ...out[i], protocols: protos.slice() };
  return out;
}
export function fillCpuProtocols(seats, all, rnd = Math.random) {
  const out = seats.slice();
  for (let i = 0; i < SEATS; i++) {
    if (!out[i] || !out[i].cpu || out[i].protocols) continue;
    const mate = out[mateOf(i)];
    const pool = all.filter(p => !(mate && mate.protocols && mate.protocols.includes(p)));
    const pick = [];
    while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    out[i] = { ...out[i], protocols: pick };
  }
  return out;
}
export const allPicked = (seats) => seats.every(x => x && Array.isArray(x.protocols) && x.protocols.length === 3);
/* エンジンの newGame に渡す分 (A1・B1 が場、A2・B2 が相棒) */
export function gameOpts(seats) {
  return { p0: seats[0].protocols.slice(), p1: seats[1].protocols.slice(), tag: { p0: seats[2].protocols.slice(), p1: seats[3].protocols.slice() } };
}

/* 手番: 質問 (request) があればその側の、無ければ手番の側の「いまの人」 */
export const seatOfRequest = (st, req) => seatIndex(req.player, st.tag.pilot[req.player]);
export const turnSeat = (st) => seatIndex(st.turn, st.tag.pilot[st.turn]);
export function activeSeat(st, req) { return req ? seatOfRequest(st, req) : turnSeat(st); }
export const activeSeatOf = (res) => activeSeat(res.state, res.requests && res.requests[0]);
export const mayAct = (st, seat, req) => activeSeat(st, req) === seat;

/* 見える手札と枚数: 自分がいまの人なら players の分、相棒の番のあいだは控え (bench) の分 */
function mine(st, seat) {
  const side = seatSide(seat);
  return st.tag.pilot[side] === seatPilot(seat) ? st.players[side] : st.tag.bench[side];
}
export const viewerHand = (st, seat) => mine(st, seat).hand.slice();
export function viewerCounts(st, seat) {
  const m = mine(st, seat);
  return { hand: m.hand.length, deck: m.deck.length, trash: m.trash.length };
}

/* CPU の席の番を続けて指す (人の番・決着・max 手で止まる)。AI の強さは呼ぶ側が Engine.setAiLevel で決める */
export function runCpu(Engine, res, seats, max = 80) {
  const trace = [], log = [];
  let steps = 0;
  while (steps < max && res.state.winner === null) {
    const req = res.requests && res.requests[0];
    const seat = activeSeat(res.state, req);
    if (!seats[seat] || !seats[seat].cpu) break;
    let next;
    if (req) next = Engine.apply(res.state, { type: 'choose', id: req.id, picks: Engine.ai.answer(res.state, req) });
    else {
      const a = Engine.ai.action(res.state);
      if (!a) break;
      next = Engine.apply(res.state, a);
    }
    if (!next || next.error) break;
    if (Array.isArray(next.trace)) trace.push(...next.trace);
    if (Array.isArray(next.log)) log.push(...next.log);
    res = next;
    steps++;
  }
  return { res, steps, trace, log };
}
