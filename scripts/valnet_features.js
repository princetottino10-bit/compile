'use strict';
/*
 * 盤面を数字の並び (特徴量) にする。学習モデル (盤面の良し悪しを点数にする) の入り口。
 * 見る側 (me) から見た形にそろえる (自分と相手を入れ替えれば、相手から見た盤面になる)。
 *
 * 並び (合計 FEATURE_SIZE 個):
 *   ライン 3 本 × 自分・相手 × 7 個: 合計 / 10、枚数 / 6、裏向きの枚数 / 6、一番上が表か、コンパイル済みか、
 *                                   そのラインでコンパイルできる形か (10 以上で相手より上)、一番上の値 / 6
 *   ライン 3 本 × 自分・相手 × 30 個: そのラインのプロトコル (30 種のどれか)
 *   全体 12 個: 手札・山札・捨て札の枚数 (自分・相手)、コンパイル済みの数 (自分・相手)、
 *               コントロール (自分 1・相手 -1・なし 0)、自分の永続ロック、相手の永続ロック、1ターンのロック (自分・相手)
 * 見えないカード (相手の手札・裏向き) は、枚数と「裏向きは値 2」しか使わない (中身は見ない)。
 */
const PROTOCOLS = ['DARKNESS', 'DEATH', 'FIRE', 'GRAVITY', 'LIFE', 'LIGHT', 'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'WATER',
  'APATHY', 'HATE', 'LOVE', 'CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'FEAR', 'ICE', 'LUCK', 'MIRROR', 'PEACE', 'SMOKE', 'TIME',
  'WAR', 'ASSIMILATION', 'DIVERSITY', 'UNITY'];
const LINE_F = 7;
const FEATURE_SIZE = 3 * 2 * LINE_F + 3 * 2 * PROTOCOLS.length + 12;

/* 永続ロック (覆われた表向きの PSYCHIC 1) と、1ターンのロック (一番上の表向きの PSYCHIC 1) */
function locks(st, side) {
  let perm = 0, temp = 0;
  for (let l = 0; l < 3; l++) {
    const k = st.lines[l][side];
    for (let j = 0; j < k.length; j++) {
      const c = st.cards[k[j]];
      if (c.faceUp && c.def === 'PSYCHIC_2') { if (j < k.length - 1) perm = 1; else temp = 1; }
    }
  }
  return [perm, temp];
}

function features(E, st, me) {
  const op = 1 - me;
  const x = new Array(FEATURE_SIZE).fill(0);
  let k = 0;
  for (let l = 0; l < 3; l++) {
    for (const s of [me, op]) {
      const stack = st.lines[l][s];
      const mine = E.lineTotal(st, l, s), theirs = E.lineTotal(st, l, 1 - s);
      const top = stack.length ? st.cards[stack[stack.length - 1]] : null;
      x[k++] = mine / 10;
      x[k++] = stack.length / 6;
      x[k++] = stack.filter(u => !st.cards[u].faceUp).length / 6;
      x[k++] = top && top.faceUp ? 1 : 0;
      x[k++] = st.players[s].protocols[l].compiled ? 1 : 0;
      x[k++] = mine >= 10 && mine > theirs ? 1 : 0;
      x[k++] = top ? E.cardValue(st, stack[stack.length - 1]) / 6 : 0;
    }
  }
  for (let l = 0; l < 3; l++) {
    for (const s of [me, op]) {
      const idx = PROTOCOLS.indexOf(st.players[s].protocols[l].name);
      if (idx >= 0) x[k + idx] = 1;
      k += PROTOCOLS.length;
    }
  }
  const P = st.players;
  const trash = (s) => (P[s].trash || []).length;
  x[k++] = P[me].hand.length / 6; x[k++] = P[op].hand.length / 6;
  x[k++] = P[me].deck.length / 18; x[k++] = P[op].deck.length / 18;
  x[k++] = trash(me) / 18; x[k++] = trash(op) / 18;
  x[k++] = P[me].protocols.filter(p => p.compiled).length / 3;
  x[k++] = P[op].protocols.filter(p => p.compiled).length / 3;
  x[k++] = st.control === me ? 1 : st.control === op ? -1 : 0;
  const lm = locks(st, me), lo = locks(st, op);
  x[k++] = lm[0]; x[k++] = lo[0]; x[k++] = lm[1] - lo[1];
  return x;
}

module.exports = { features, FEATURE_SIZE, PROTOCOLS };
