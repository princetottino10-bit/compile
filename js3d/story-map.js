/* =========================================================================
 * ストーリーの歩ける地図 (画面を持たない。story-world.js が three.js で描く)
 *   地図は文字の並び。1文字 = 1マス。座標はマス単位 (x = 列, y = 行。マスの真ん中は +0.5)。
 *   扉は「前の出来事 (story.js の場面) を終えたら開く」。出来事は場面 (node) と結びつく。
 * ========================================================================= */
import { isCleared, currentNode, chapterOf } from './story.js';

/* 印 → マスの種類。wall / solid (物が置いてある) は通れない。door / gate は開くまで通れない */
export const TILE = {
  '#': 'wall', '.': 'floor', 'S': 'floor', 'K': 'floor', 'p': 'floor', 'c': 'floor', 'e': 'floor', 'R': 'floor',
  'T': 'solid', 'a': 'door', 'b': 'door', 'd': 'door', 'g': 'gate',
  /* 水族館: W 大水槽 / J クラゲの水槽 / Q 案内カウンター / X 通せんぼの柵 / x 明かりの落ちた通路 (入れない) */
  'W': 'solid', 'J': 'solid', 'Q': 'solid', 'X': 'solid', 'x': 'solid'
};

/* 序章「起動」: 研究所。左から A 判定室 / B 端末室 / C 廊下 / D 正面ホール / E 外 */
export const PROLOGUE = {
  look: 'lab',          /* 背景の作り (story-world.js が選ぶ) */
  rows: [
    '######################################',
    '#......#.......#..........#......####',
    '#.S....#...T...#..p....p..#...c..geee#',
    '#......a.......b..........d......geee#',
    '#..K...#.......#..........#......geee#',
    '#......#.......#..........#......####',
    '######################################'
  ].map(r => r.padEnd(38, '#')),
  /* この行より手前 (画面の下側) の壁は低く切り落とす (カメラから扉と通り道が見えるように) */
  cutRow: 3,
  /* 区画の境 (x がこれより小さい) */
  zones: [['A', 7], ['B', 15], ['C', 26], ['D', 33], ['E', Infinity]],
  zoneNames: { A: '判定室', B: '端末室', C: '廊下', D: '正面ホール', E: '外' },
  /* 扉の印 → 開く条件 (この場面をクリアしたら) */
  opens: { a: 'c0-practice', b: 'c0-lock', d: 'c0-lock', g: 'c0-chief' },
  /* 出来事。kind: auto (来たら始まる) / talk (人に話しかける) / inspect (物を調べる) / zone (区画に入る) */
  events: {
    wake: { node: 'c0-wake', kind: 'auto' },
    practice: { node: 'c0-practice', kind: 'talk', at: 'K', who: 'shion' },
    log: { node: 'c0-log', kind: 'inspect', at: 'T', label: '端末を調べる' },
    lock: { node: 'c0-lock', kind: 'inspect', at: 'T', label: '扉の鍵を外す' },
    gate: { node: 'c0-gate', kind: 'zone', zone: 'D' },
    chief: { node: 'c0-chief', kind: 'talk', at: 'c', who: 'chief' },
    escape: { node: 'c0-escape', kind: 'zone', zone: 'E' }
  },
  /* 次の出来事ごとの出てくる場所 (対戦から戻ったとき) */
  spawn: { 'c0-wake': [3, 2], 'c0-practice': [3, 2], 'c0-log': [5, 3], 'c0-lock': [11, 3], 'c0-gate': [13, 3],
    'c0-chief': [29, 3], 'c0-escape': [31, 3], done: [31, 3] },
  /* 案内の行き先 (人や物のいない出来事だけ。人・物・巡回はその位置へ案内する) */
  guides: { 'c0-gate': [28, 3], 'c0-escape': [35, 3] },
  goals: { 'c0-wake': '目を覚ます', 'c0-practice': '紫苑の判定を受ける', 'c0-log': '奥の部屋の端末を調べる', 'c0-lock': '端末で、扉の鍵を外す',
    'c0-gate': '正面ホールへ進む', 'c0-chief': '警備主任を越える',
    'c0-escape': 'ゲートを抜けて外へ', done: '序章「起動」　完。1章「順路」は準備中' }
};

/* 1章「順路」: 閉館した水族館。左から A 入口ホール / B 大水槽 / C クラゲの部屋 / D 分かれ道 / E 出口ホール。
   扉はない。順路は一本道で、区画に入ると案内の放送が流れる。分かれ道の上 (x) は明かりの落ちた通路で、柵 (X) から先へは行けない */
export const AQUARIUM = {
  look: 'aquarium',
  rows: [
    '###########################xxxx#######',
    '#######WWWWWWWWWWJJJJJJJJJ#xxxx#######',
    '#......WWWWWWWWWW..........XXXX...QQQ#',
    '#.S...............................R..#',
    '#....................................#',
    '#......#.........#........#.....#....#',
    '######################################'
  ],
  cutRow: 3,
  zones: [['A', 7], ['B', 17], ['C', 26], ['D', 32], ['E', Infinity]],
  zoneNames: { A: '入口ホール', B: '大水槽', C: 'クラゲの部屋', D: '分かれ道', E: '出口ホール' },
  opens: {},
  events: {
    arrive: { node: 'c1-arrive', kind: 'auto' },
    tank: { node: 'c1-tank', kind: 'zone', zone: 'B' },
    jelly: { node: 'c1-jelly', kind: 'zone', zone: 'C' },
    fork: { node: 'c1-fork', kind: 'zone', zone: 'D' },
    ruri: { node: 'c1-ruri', kind: 'talk', at: 'R', who: 'ruri' },
    abyss: { node: 'c1-abyss', kind: 'talk', at: 'R', who: 'ruri' },
    close: { node: 'c1-close', kind: 'auto' }
  },
  spawn: { 'c1-arrive': [2, 3], 'c1-tank': [2, 3], 'c1-jelly': [15, 3], 'c1-fork': [24, 3], 'c1-ruri': [29, 3],
    'c1-abyss': [33, 4], 'c1-close': [33, 4], done: [33, 4] },
  guides: { 'c1-tank': [9, 4], 'c1-jelly': [19, 4], 'c1-fork': [28, 4] },
  goals: { 'c1-arrive': '水族館に入る', 'c1-tank': '順路どおりに進む', 'c1-jelly': '順路どおりに進む', 'c1-fork': '順路どおりに進む',
    'c1-ruri': '順路の終わりにいる案内係に話しかける', 'c1-abyss': '瑠璃と一緒に、深淵と向き合う', 'c1-close': '……',
    done: '1章「順路」　完。2章「三時」は準備中' }
};

/* 章ごとの地図 */
export const MAPS = { ch0: PROLOGUE, ch1: AQUARIUM };
export const mapFor = (chapterId) => MAPS[chapterId] || PROLOGUE;

export const width = (map) => map.rows[0].length;
export const height = (map) => map.rows.length;
export function charAt(map, x, y) {
  if (y < 0 || y >= map.rows.length || x < 0 || x >= map.rows[0].length) return '#';
  return map.rows[y][x];
}
export function find(map, ch) {
  const out = [];
  map.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === ch) out.push({ x, y }); });
  return out;
}
/* そのマスを歩けるか (扉は開く条件の場面をクリアしていれば) */
export function walkable(map, s, x, y) {
  if (y < 0 || y >= height(map) || x < 0 || x >= width(map)) return false;
  const ch = charAt(map, x, y);
  const t = TILE[ch];
  if (t === 'floor') return true;
  if (t === 'door' || t === 'gate') return isCleared(s, map.opens[ch]);
  return false;
}
export function isOpen(map, s, ch) { return isCleared(s, map.opens[ch]); }

export function zoneAt(map, p) {
  for (const [z, x] of map.zones) if (p.x < x) return z;
  return map.zones[map.zones.length - 1][0];
}
export function spawnFor(map, s) {
  const cur = currentNode(s);
  const [x, y] = map.spawn[cur ? cur.id : 'done'] || map.spawn.done;
  return { x: x + 0.5, y: y + 0.5 };
}
export function objective(s) {
  const cur = currentNode(s);
  return mapFor(chapterOf(s).id).goals[cur ? cur.id : 'done'];
}

/* 円 (半径 r) が通れないマスに重なるか */
function blocked(map, s, px, py, r) {
  for (let y = Math.floor(py - r); y <= Math.floor(py + r); y++) {
    for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++) {
      if (walkable(map, s, x, y)) continue;
      const cx = Math.max(x, Math.min(px, x + 1)), cy = Math.max(y, Math.min(py, y + 1));
      if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}
/* 動かす: 横と縦を別々に試して、ぶつかる向きだけ止める (壁に沿って滑る) */
export function move(map, s, p, d, r) {
  let { x, y } = p;
  if (d.x && !blocked(map, s, x + d.x, y, r)) x += d.x;
  if (d.y && !blocked(map, s, x, y + d.y, r)) y += d.y;
  return { x, y };
}

/* 道探し: from から to まで、歩けるマスだけを通る道 (マスの真ん中の並び。最後は to そのもの)。
   8方向。斜めは、角の両側のマスが歩けるときだけ (壁の角をかすめない)。行けなければ null */
export function findPath(map, s, from, to) {
  const tx = Math.floor(to.x), ty = Math.floor(to.y);
  if (!walkable(map, s, tx, ty)) return null;
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  if (sx === tx && sy === ty) return [{ x: to.x, y: to.y }];
  const W = width(map), key = (x, y) => y * W + x;
  const prev = new Map([[key(sx, sy), -1]]);
  const queue = [[sx, sy]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (prev.has(key(nx, ny)) || !walkable(map, s, nx, ny)) continue;
      if (dx && dy && (!walkable(map, s, x + dx, y) || !walkable(map, s, x, y + dy))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const out = [];
  for (let k = key(tx, ty); k !== key(sx, sy); k = prev.get(k)) out.push({ x: (k % W) + 0.5, y: Math.floor(k / W) + 0.5 });
  out.reverse();
  out[out.length - 1] = { x: to.x, y: to.y };
  return out;
}
