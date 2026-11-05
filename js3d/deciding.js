/* =========================================================================
 * 勝ち確・負け確の見きわめ (キャラのひとこと「sure」「doomed」の出しどころ)
 *   番が来た側が、このターンのコンパイルで決着をつけられるか。
 *   エンジン (engine.js) を引数でもらう純粋な関数なので、node --test でそのまま試せる
 * ========================================================================= */

/* 決着に要るコンパイルの本数 (勝ち抜き戦の異変で側ごとに違うことがある) */
function needOf(st, side) {
  return Array.isArray(st.winBySide) ? st.winBySide[side] : (st.winCompiles || 3);
}

/* コンパイルするときにコントロールを持っているか。もう持っているか、まだコントロールの確認の前で、
   2ライン以上で上回っていてこの番に得るか (engine.js の checkControl と同じ数え方) */
function controlAtCompile(st, side, E) {
  if (!st.useControl) return false;
  if (st.bot && side === st.bot.side) return false;      // ソロモードの BOT はコントロールで並べ替えない
  if (st.control === side) return true;
  if (st.phase !== 'start' && st.phase !== 'checkControl') return false;
  let wins = 0;
  for (let l = 0; l < 3; l++) if (E.lineTotal(st, l, side) > E.lineTotal(st, l, 1 - side)) wins++;
  return wins >= 2;
}

/**
 * その側が、番の頭のコンパイルで勝ちを決められるか。
 * まだ済んでいないプロトコルのラインでコンパイルできれば勝ち。済んだプロトコルのラインしかコンパイルできなくても、
 * コントロールを持っていればコンパイルのときに自分のプロトコルを並べ替えて、まだのプロトコルをそのラインへ
 * 持ってこられるので勝ち (ユーザー 2026-11-05「protocol入れ替えて勝ち確のパターンもちゃんと専用せりふ言って」)
 */
export function decidingLine(st, side, E) {
  if (!st || !st.lines || !st.players || st.winner !== null || !E) return false;
  const p = st.players[side];
  if (!p || !Array.isArray(p.protocols) || p.cannotCompile) return false;
  if (p.protocols.filter(x => x.compiled).length !== needOf(st, side) - 1) return false;
  const lines = E.compilableLines(st, side);
  if (!lines.length) return false;
  if (lines.some(l => p.protocols[l] && !p.protocols[l].compiled)) return true;
  return controlAtCompile(st, side, E);
}
