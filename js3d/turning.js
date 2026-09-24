/* =========================================================================
 * 試合後の分かれ目: 1手ごとの優勢の推移と、流れが大きく動いた手
 *   優勢はエンジンの AI の盤面評価 (Engine.ai.score、自分から見た点数) を -1..1 に縮めたもの。
 *   試合が終わってからの振り返りにだけ使う (対戦中の AI の判断には関わらない)。ここは計算だけ
 * ========================================================================= */

const SCALE = 600;                 // これくらいの点差で「かなり有利」(0.76) になる

/* 点数を -1..1 の優勢にする。勝ち・負けの盤面 (±1e9) は ±1 */
export function advantage(score) {
  if (!Number.isFinite(score)) return 0;
  if (score >= 1e8) return 1;
  if (score <= -1e8) return -1;
  return Math.tanh(score / SCALE);
}

/* scores: 各手を指す前の盤面の点数 (手の数だけ) + 決着の盤面の点数 → 優勢の列 (手の数 + 1) */
export function advantageSeries(scores) {
  return scores.map(advantage);
}

/* 流れが大きく動いた手。i 手目の動き = adv[i+1] - adv[i] (自分から見て、+ は自分に傾いた)。
   動きの大きい順に max 個まで、min より小さい動きは入れない。返り値は手の番号の昇順
   [{ index, swing }] */
export function turningPoints(adv, max = 3, min = 0.22) {
  const moves = [];
  for (let i = 0; i + 1 < adv.length; i++) moves.push({ index: i, swing: adv[i + 1] - adv[i] });
  /* 決着の一手 (最後の手) は必ず大きく動くので、分かれ目からは外す */
  const pool = moves.slice(0, -1).filter(m => Math.abs(m.swing) >= min);
  return pool.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing)).slice(0, max).sort((a, b) => a.index - b.index);
}
