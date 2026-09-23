/* =========================================================================
 * シングルプレイのルール (使うプロトコルの範囲・ドラフト)
 *   画面から切り離した決まりごとだけを置く (node のテストから直接呼べる)。
 *   ドラフトの順番はオンライン (supabase/functions/secure-room) と同じ:
 *     BAN を先手から1つずつ交互に → 先手1 → 後手2 → 先手2 → 後手1
 * ========================================================================= */

/* 使うプロトコルの範囲 */
export const POOLS = [
  { key: 'main1', label: 'Main 1', sets: ['Main 1'] },
  { key: 'main12', label: 'Main 1+2', sets: ['Main 1', 'Main 2'] },
  { key: 'all', label: '全部', sets: null }
];

export function poolNames(protocols, key) {
  const pool = POOLS.find(p => p.key === key) || POOLS[POOLS.length - 1];
  return protocols.filter(p => !pool.sets || pool.sets.includes(p.set)).map(p => p.name);
}

/* 候補の数は「各自3つ + BAN ぶん」以上、範囲の数以下 (0 = 範囲の全部) */
export function clampCandidates(size, bans, available) {
  const need = 6 + bans * 2;
  if (!size || size >= available) return available;
  return Math.max(need, Math.min(available, size));
}

export function draftSteps(first, bans) {
  const second = 1 - first;
  const steps = [];
  for (let i = 0; i < bans * 2; i++) steps.push({ side: i % 2 === 0 ? first : second, n: 1, kind: 'ban' });
  return steps.concat([
    { side: first, n: 1, kind: 'pick' }, { side: second, n: 2, kind: 'pick' },
    { side: first, n: 2, kind: 'pick' }, { side: second, n: 1, kind: 'pick' }
  ]);
}

export function shuffled(list, rnd = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ランダムに3つずつ (重ならない) */
export function randomDecks(names, rnd = Math.random) {
  const s = shuffled(names, rnd);
  return { me: s.slice(0, 3), ai: s.slice(3, 6) };
}

/* CPU のドラフト: 強さの目安 (勝率) で選ぶ。BAN も「相手に取られたくない強いもの」を選ぶ。
   level 0 (かんたん) は無作為、1 (ふつう) は強いものほど選びやすく、2 以上は一番強いもの */
export function cpuDraftPick(pool, n, level, strength, rnd = Math.random) {
  const left = pool.slice();
  const out = [];
  const score = (name) => (strength && Number.isFinite(strength[name]) ? strength[name] : 0.5);
  while (out.length < n && left.length) {
    let i;
    if (level <= 0) {
      i = Math.floor(rnd() * left.length);
    } else if (level === 1) {
      /* 勝率の差を強調して重み付け (差 5pt で約 3.5 倍) */
      const w = left.map(name => Math.exp((score(name) - 0.5) * 25));
      let r = rnd() * w.reduce((a, b) => a + b, 0);
      i = 0;
      while (i < w.length - 1 && (r -= w[i]) > 0) i++;
    } else {
      i = 0;
      left.forEach((name, j) => { if (score(name) > score(left[i])) i = j; });
    }
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}
