/* 週替わり3連戦の「その週の9つと3人の相手」(js3d/weekly.js の weeklySet と同じ計算)。
   サーバーでクリアを確かめるための写し。ずれないことは test/weekly-set-sync.test.js が確かめる。
   相手のデッキの定数は js3d/aidecks.js と同じ */
export const STRONGEST_AI = ['FIRE', 'WATER', 'SPEED'];
export const CHALLENGER_BASE = 5;
export const CHALLENGERS = [
  { deck: ['DARKNESS', 'SPEED', 'HATE'] },
  { deck: ['DARKNESS', 'HATE', 'SMOKE'] },
  { deck: ['HATE', 'FIRE', 'WAR'] },
  { deck: ['SMOKE', 'WATER', 'PEACE'] }
];

function seeded(key) {
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample(list, n, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/* 途中で足したプロトコルと、週替わりに入れはじめる週 (2026-11-09 の週)。それより前の週は前のままの顔ぶれ */
const LATE_FROM = 2967;
const LATE_PROTOCOLS = ['AMBUSH', 'ENVY', 'FULCRUM', 'GLUTTONY', 'GREED', 'LUST', 'MOMENTUM', 'NOVA', 'OVERWHELM', 'PRIDE', 'SLOTH', 'WRATH',
  'FLEXIBLE', 'INERT', 'RIGID'];
export function weeklySet(key, names) {
  const rnd = seeded(key);
  /* Main 3 / Aux 3 は追加した週 (W2966) の途中から顔ぶれが変わらないよう、次の週から入れる */
  const late = +String(key).slice(1) < LATE_FROM;
  const pool = names.filter(n => !late || !LATE_PROTOCOLS.includes(n)).sort();
  const nine = sample(pool, 9, rnd);
  const strong = sample(pool.filter(n => !nine.includes(n)), 3, rnd);
  const ch = Math.floor(rnd() * CHALLENGERS.length);
  return {
    week: key,
    nine,
    opponents: [
      { deck: strong, level: 2 },
      { deck: CHALLENGERS[ch].deck.slice(), level: CHALLENGER_BASE + ch },
      { deck: STRONGEST_AI.slice(), level: 3, boss: true }
    ]
  };
}
