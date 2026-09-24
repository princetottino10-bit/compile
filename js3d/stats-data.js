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

/* ---------- カードの戦績と、使って勝つほど光る枠 ----------
   記録の cards (その試合で自分が表で出したカード) から、カードごとの 使った試合数・勝った試合数 */
export function cardStats(records) {
  const map = new Map();
  const get = (id) => { let t = map.get(id); if (!t) { t = { id, games: 0, wins: 0, effects: 0 }; map.set(id, t); } return t; };
  for (const r of records) {
    for (const id of r.cards || []) {
      const t = get(id);
      t.games++;
      if (r.win) t.wins++;
    }
    /* 効果の発動回数 (裏から表に返った札・上段の常在効果の誘発なども含む) */
    for (const [id, n] of Object.entries(r.effects || {})) get(id).effects += n;
  }
  return map;
}

/* 勝った試合の数で決まる光り方。見た目だけで強さは変わらない */
export const CARD_TIERS = [
  { min: 3, key: 'bronze', name: '銅', color: '#d98b52' },
  { min: 10, key: 'silver', name: '銀', color: '#cfe0f5' },
  { min: 25, key: 'gold', name: '金', color: '#ffd45e' },
  { min: 50, key: 'holo', name: 'ホロ', color: '#b98cff', holo: true }
];

export function cardTier(wins) {
  let tier = null;
  for (const t of CARD_TIERS) if (wins >= t.min) tier = t;
  return tier;
}

/* ---------- プレイヤーレベル ----------
   経験値は 1戦 +1、勝ち +2、つよい以上に勝つと さらに +1 (プロトコル習熟度と同じ数え方を1試合1回)。
   次のレベルまでに要る量は少しずつ増える。盤面の柄の解放などに使う */
export const PLAYER_STEPS = [0, 4, 10, 18, 28, 40, 55, 72, 92, 115, 140, 170, 205, 245, 290];

export function playerXp(records) {
  let xp = 0;
  for (const r of records) xp += 1 + (r.win ? 2 + (r.level >= STRONG ? 1 : 0) : 0);
  return xp;
}

/* そのレベルになるのに要る経験値の合計 */
export function xpForLevel(lv) {
  return lv <= PLAYER_STEPS.length ? PLAYER_STEPS[lv - 1] : PLAYER_STEPS[PLAYER_STEPS.length - 1] + 50 * (lv - PLAYER_STEPS.length);
}

/* bonus: CPU 戦の戦績以外で入った経験値 (xp.js の帳簿: オンライン対戦・チュートリアルなど) */
export function playerLevel(records, bonus = 0) {
  const xp = playerXp(records) + bonus;
  const need = xpForLevel;
  let level = 1;
  while (xp >= need(level + 1)) level++;
  const cur = need(level), next = need(level + 1);
  return { level, xp, cur, next, progress: (xp - cur) / (next - cur) };
}
