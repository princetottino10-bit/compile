'use strict';
/*
 * コンボ学習の入り口: 盤面を「自分のカードの並び」の札 (トークン) にする。
 * 学習モデル (valnet) が盤面の数字 (合計・枚数・プロトコル) を見るのに対して、こちらはカード1枚ずつを見て、
 * 「どの2枚が同時にあると得か」(組み合わせ) を学ばせるための形にする。
 *
 * 見るのは自分の持ち札だけ (相手の手札と裏向きは見えないので使わない)。カードは内部 ID で持つ。
 *   H:<id>  手札
 *   T:<id>  場の一番上で表向き (中段・上段・下段が生きている)
 *   C:<id>  場で覆われているが表向き (上段の常在効果だけ生きている。覆いを外すと中段がもう一度入る)
 *   D:<id>  場で裏向き (自分には中身が分かる。表に返す手段と組む)
 * 同じ札が2枚あれば2回並ぶ。順番に意味は無い。
 */
function comboTokens(st, me) {
  const out = [];
  for (const uid of st.players[me].hand) out.push('H:' + st.cards[uid].def);
  for (let l = 0; l < 3; l++) {
    const stack = st.lines[l][me];
    for (let j = 0; j < stack.length; j++) {
      const c = st.cards[stack[j]];
      if (!c.faceUp) out.push('D:' + c.def);
      else out.push((j === stack.length - 1 ? 'T:' : 'C:') + c.def);
    }
  }
  return out;
}

module.exports = { comboTokens };
