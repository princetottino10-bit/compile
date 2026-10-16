/* オンラインの観戦の賭け (観客どうしのパリミュチュエル) の計算。
   画面側 (js3d/roombet.js) と同じ計算の写し。ずれないことは test/roombet.test.js が確かめる。
   賭けるのは CHIP (ゲームの中のポイント) だけで、現金・課金とはつながらない */
export const ROOM_BET_AMOUNTS = [5, 15, 30, 50];
/* 受付は序盤だけ: 両者合わせて 4 手番 (それぞれの 2 手番目) を終えるまで。勝ち負けが見えてから賭けられないように */
export const ROOM_BET_TURNS = 4;
/* 胴元の見せ金: 両側に 50 ずつ置いたことにする。誰も賭けていなくても倍率が出て (1.9 倍)、
   1人だけ賭けたときに倍率が 1 倍に潰れない */
export const ROOM_BET_SEED = 50;
/* 胴元の取り分 5% (CPU の観戦の賭けと同じ) */
export const ROOM_BET_CUT = 0.05;

/** 両側の倍率 [作った人, 参加した人]。pools: 両側に賭けられた CHIP の合計。1.1 倍より下げない */
export function roomBetOdds(pools) {
  const p = [Math.max(0, pools[0] | 0), Math.max(0, pools[1] | 0)];
  const total = p[0] + p[1] + ROOM_BET_SEED * 2;
  return p.map((x) => Math.max(1.1, Math.floor((total * (1 - ROOM_BET_CUT)) / (x + ROOM_BET_SEED) * 10) / 10));
}

/** 当たったときに戻る CHIP (賭けた分こみ)。5 の倍数に切り上げ */
export function roomBetPayout(amount, odds) {
  return Math.ceil((amount * odds) / 5) * 5;
}

/** 賭けの並び [{ side, amount }] から、両側の合計 */
export function roomBetPools(bets) {
  const pools = [0, 0];
  for (const b of bets || []) if (b && (b.side === 0 || b.side === 1)) pools[b.side] += b.amount | 0;
  return pools;
}

/** 決着したときの1件の結果。winner: 0 / 1、null は不成立 (部屋が消えた・決着がつかなかった) で賭けた分を戻す */
export function roomBetSettle(bet, winner, pools) {
  if (winner !== 0 && winner !== 1) return { result: 'refund', payout: bet.amount };
  if (bet.side !== winner) return { result: 'lose', payout: 0 };
  return { result: 'win', payout: roomBetPayout(bet.amount, roomBetOdds(pools)[winner]) };
}
