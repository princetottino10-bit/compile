/* =========================================================================
 * ストーリーの歩ける地図 (画面を持たない。story-world.js が three.js で描く)
 *   地図は文字の並び。1文字 = 1マス。座標はマス単位 (x = 列, y = 行。マスの真ん中は +0.5)。
 *   扉は「前の出来事 (story.js の場面) を終えたら開く」。出来事は場面 (node) と結びつく。
 * ========================================================================= */
import { isCleared, currentNode } from './story.js';

/* 印 → マスの種類。wall / solid (物が置いてある) は通れない。door / gate は開くまで通れない */
export const TILE = {
  '#': 'wall', '.': 'floor', 'S': 'floor', 'K': 'floor', 'p': 'floor', 'c': 'floor', 'e': 'floor',
  'T': 'solid', 'a': 'door', 'b': 'door', 'd': 'door', 'g': 'gate'
};

/* 序章「起動」: 研究所のサーバー。左から A 目覚めの部屋 / B ログの保管庫 / C 巡回路 / D ゲートの広間 / E 外 */
export const PROLOGUE = {
  rows: [
    '######################################',
    '#......#.......#..........#......####',
    '#.S....#...T...#..p....p..#...c..geee#',
    '#......a.......b..........d......geee#',
    '#..K...#.......#..........#......geee#',
    '#......#.......#..........#......####',
    '######################################'
  ].map(r => r.padEnd(38, '#')),
  /* 区画の境 (x がこれより小さい) */
  zones: [['A', 7], ['B', 15], ['C', 26], ['D', 33], ['E', Infinity]],
  zoneNames: { A: '目覚めの部屋', B: 'ログの保管庫', C: '巡回路', D: 'ゲートの広間', E: '外' },
  /* 扉の印 → 開く条件 (この場面をクリアしたら) */
  opens: { a: 'c0-practice', b: 'c0-log', d: 'c0-patrol', g: 'c0-chief' },
  /* 出来事。kind: auto (来たら始まる) / talk (人に話しかける) / inspect (物を調べる) / guard (巡回にぶつかる) / zone (区画に入る) */
  events: {
    wake: { node: 'c0-wake', kind: 'auto' },
    practice: { node: 'c0-practice', kind: 'talk', at: 'K', who: 'shion' },
    log: { node: 'c0-log', kind: 'inspect', at: 'T', label: '端末を調べる' },
    patrol: { node: 'c0-patrol', kind: 'guard', at: 'p' },
    gate: { node: 'c0-gate', kind: 'zone', zone: 'D' },
    chief: { node: 'c0-chief', kind: 'talk', at: 'c', who: 'chief' },
    escape: { node: 'c0-escape', kind: 'zone', zone: 'E' }
  },
  /* 次の出来事ごとの出てくる場所 (対戦から戻ったとき) */
  spawn: { 'c0-wake': [3, 2], 'c0-practice': [3, 2], 'c0-log': [5, 3], 'c0-patrol': [13, 3], 'c0-gate': [24, 3],
    'c0-chief': [29, 3], 'c0-escape': [31, 3], done: [31, 3] },
  goals: { 'c0-wake': '目を覚ます', 'c0-practice': '紫苑に話しかける', 'c0-log': '奥の部屋の端末を調べる',
    'c0-patrol': '巡回の警備 AI を止める', 'c0-gate': 'ゲートの広間へ進む', 'c0-chief': '警備主任 AI と戦う',
    'c0-escape': 'ゲートを抜けて外へ', done: '序章クリア。1章「閉館」は準備中' }
};

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
  return PROLOGUE.goals[cur ? cur.id : 'done'];
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
