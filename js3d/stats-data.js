/* =========================================================================
 * 戦績の集計 (画面を持たない計算だけ。stats.js が描く)
 *   記録: { id, me[3], opp[3], win, level, at, turns?, feats? }
 * ========================================================================= */

/* 難易度の番号 (aidecks.js): 2 = つよい、3 以上 = 最強・ロック特化・挑戦者 */
const STRONG = 2, STRONGEST = 3;

/* 習熟度: そのプロトコルで1戦 +1、勝てば +2、つよい以上に勝てば さらに +1 */
export const MASTERY_STEPS = [0, 3, 8, 15, 25, 40, 60, 85, 115, 150];

export function masteryLevel(xp) {
  let lv = 0;
  while (lv < MASTERY_STEPS.length && xp >= MASTERY_STEPS[lv]) lv++;
  const cur = MASTERY_STEPS[lv - 1] || 0;
  const next = MASTERY_STEPS[lv];
  return { level: lv, xp, cur, next: next === undefined ? null : next,
    progress: next === undefined ? 1 : (xp - cur) / (next - cur) };
}

/* プロトコルごとの 戦数・勝数・習熟度・制覇 (勝った / つよいに勝った / 最強に勝った) */
export function protocolSummary(records) {
  const map = new Map();
  for (const r of records) {
    for (const name of r.me || []) {
      const t = map.get(name) || { name, games: 0, wins: 0, xp: 0, won: false, wonStrong: false, wonStrongest: false };
      t.games++;
      t.xp += 1;
      if (r.win) {
        t.wins++;
        t.xp += 2;
        t.won = true;
        if (r.level >= STRONG) { t.xp += 1; t.wonStrong = true; }
        if (r.level >= STRONGEST) t.wonStrongest = true;
      }
      map.set(name, t);
    }
  }
  for (const t of map.values()) Object.assign(t, { mastery: masteryLevel(t.xp) });
  return map;
}

/* 自分のプロトコル × 相手のプロトコル の勝敗 */
export function matchups(records) {
  const map = new Map();
  for (const r of records) {
    for (const a of r.me || []) {
      for (const b of r.opp || []) {
        const k = a + '|' + b;
        const t = map.get(k) || { me: a, opp: b, n: 0, w: 0 };
        t.n++;
        if (r.win) t.w++;
        map.set(k, t);
      }
    }
  }
  return map;
}

/* 直近 window 戦の勝率の推移 (古い順)。最後の limit 戦ぶん */
export function winTrend(records, window, limit) {
  const list = records.slice(-(limit + window - 1));
  const out = [];
  for (let i = window - 1; i < list.length; i++) {
    const slice = list.slice(i - window + 1, i + 1);
    out.push(slice.filter(r => r.win).length / window);
  }
  return out;
}

/* 最短ターン勝利 (手番の数が残っている記録だけ)。無ければ null */
export function fastestWin(records, filter) {
  let best = null;
  for (const r of records) {
    if (!r.win || !Number.isInteger(r.turns) || (filter && !filter(r))) continue;
    if (!best || r.turns < best.turns) best = r;
  }
  return best;
}
