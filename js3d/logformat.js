/* ---------- ログの整形 ----------
   エンジンのログはカードを def ID (DARKNESS_6) で書くが、カードに印刷されて
   いる表記は「DARKNESS 5」なので、そのままだと盤面と数字が食い違う。
   表記を直したうえで、カード名は触れる部品として切り出す。
   盤面の状態や自分の席は main.js から関数で受け取る (ここでは持たない) */
const LOG_DEF_RE = /[A-Z]+_\d/g;

/**
 * @param {{ defIndex: object, seat: () => number, roomSide: () => (number|null),
 *           demo: () => boolean, state: () => object }} ctx
 * @returns {(msg: string) => Array<{text: string, card?: string}>}
 */
export function createLogFormat(ctx) {
  function seatText(text) {
    if (ctx.demo()) return text;                    // 観戦は P1/P2 のまま
    const me = ctx.seat();
    const mine = 'P' + (me + 1), opp = 'P' + (2 - me);
    /* "P1:" や "P1 の" の形だけ置き換える (英字混じりの文言を壊さない) */
    return text.replace(/(^|[\s(（\[])P([12])(?=[:\s：の])/g, (m, pre, n) =>
      pre + ('P' + n === mine ? 'あなた' : 'P' + n === opp ? '相手' : 'P' + n));
  }

  /* 「ライン2」だけでは列が分からないので、行為者側のプロトコル名を添える */
  function lineText(text, actorSeat) {
    const st = ctx.state();
    if (!st || !st.players) return text;
    const roomSide = ctx.roomSide();
    const side = actorSeat === null ? null
      : (roomSide !== null ? (actorSeat === roomSide ? 0 : 1) : actorSeat);
    return text.replace(/ライン([123])(?!〈)/g, (m, n) => {
      const l = +n - 1;
      const names = side === null
        ? [st.players[0].protocols[l].name, st.players[1].protocols[l].name]
        : [st.players[side].protocols[l].name];
      return m + '〈' + names.join('/') + '〉';
    });
  }

  return function logParts(msg) {
    const text = String(msg == null ? '' : msg);
    const turn = text.match(/^---\s*P(\d)\s*のターン\s*---$/);
    if (turn) {
      const mine = (+turn[1] - 1) === ctx.seat();
      const out = [];
      out.turn = mine ? 0 : 1;
      out.label = mine ? 'あなたのターン' : '相手のターン';
      return out;
    }
    const actor = text.match(/^P([12])[:\s]/);
    const actorSeat = actor ? +actor[1] - 1 : null;
    /* 裏向きプレイは "カード をライン…" と余分な空白が入るので詰める */
    const body = text.replace(/^(P[12]: )カード を/, '$1カードを');
    const plain = (t) => lineText(seatText(t), actorSeat);
    const parts = [];
    let last = 0, m;
    LOG_DEF_RE.lastIndex = 0;
    while ((m = LOG_DEF_RE.exec(body)) !== null) {
      const d = ctx.defIndex[m[0]];
      if (!d) continue;
      if (m.index > last) parts.push({ text: plain(body.slice(last, m.index)) });
      parts.push({ card: m[0], text: d.proto + ' ' + d.value });
      last = m.index + m[0].length;
    }
    if (last < body.length) parts.push({ text: plain(body.slice(last)) });
    return parts.length ? parts : [{ text: plain(body) }];
  };
}
