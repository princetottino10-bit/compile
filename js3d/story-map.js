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
  'W': 'solid', 'J': 'solid', 'Q': 'solid', 'X': 'solid', 'x': 'solid',
  /* 調べられる物 (looks) の置き場所。床として歩ける */
  '1': 'floor', '2': 'floor', '3': 'floor', '4': 'floor',
  /* 記録の断片の置き場所 (拾える物。歩ける) */
  'f': 'floor', 'h': 'floor'
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
    'c0-escape': 'ゲートを抜けて外へ', done: '序章「起動」　完' }
};

/* 1章「順路」: 閉館した水族館 (2026-10-11 作り直し。一本道をやめ、広場から寄り道できる形に)。
   入口 → 広場 → 西 (大水槽) / 東 (クラゲの部屋) / 北 (職員通路。その奥に職員室)。本筋に要るのは北だけ。
   仕掛け: 案内の矢印は出さない。どの部屋でも同じ放送が流れていて、途切れる場所 (北の通路。スピーカーが火花を散らす) を自分で探す。
   北の通路で放送が途切れると (c1-fork)、出口ホールの扉 (d) が開き、瑠璃に会える。
   寄り道: 調べられる物 (looks) と、止められた機体の記録の断片 (fragments。拾うと進み具合に残り、5章で回収する) */
export const AQUARIUM = {
  look: 'aquarium',
  rows: [
    '##################################',
    '#........######xxxx####......QQQ.#',
    '#.3...4..######XXXX####..........#',
    '#..................1..d.......R..#',
    '#......h.###..........d..........#',
    '#........###..........#..........#',
    '###############....###############',
    '#.WWWWWWWW.#..........#.JJJJJJJJ.#',
    '#.WWWWWWWW.#..........#..........#',
    '#................................#',
    '#................................#',
    '#..........#..........#..........#',
    '#........f.#..........#..........#',
    '###############....###############',
    '############.2........############',
    '############....S.....############',
    '############..........############',
    '##################################'
  ],
  /* 区画は四角で持つ (上から順に見て、最初に入った四角)。zones は使わない */
  rects: [
    { z: 'S', x0: 1, y0: 1, x1: 8, y1: 5 },
    { z: 'E', x0: 22, y0: 1, x1: 32, y1: 5 },
    { z: 'N', x0: 9, y0: 1, x1: 21, y1: 6 },
    { z: 'B', x0: 1, y0: 7, x1: 11, y1: 12 },
    { z: 'C', x0: 22, y0: 7, x1: 32, y1: 12 },
    { z: 'H', x0: 12, y0: 7, x1: 21, y1: 12 },
    { z: 'A', x0: 12, y0: 13, x1: 21, y1: 16 }
  ],
  zones: [['A', Infinity]],
  zoneNames: { A: '入口ホール', H: '広場', B: '大水槽', C: 'クラゲの部屋', N: '職員通路', S: '職員室', E: '出口ホール' },
  opens: { d: 'c1-fork' },
  events: {
    arrive: { node: 'c1-arrive', kind: 'auto' },
    fork: { node: 'c1-fork', kind: 'zone', zone: 'N' },
    ruri: { node: 'c1-ruri', kind: 'talk', at: 'R', who: 'ruri' },
    abyss: { node: 'c1-abyss', kind: 'talk', at: 'R', who: 'ruri' },
    close: { node: 'c1-close', kind: 'auto' }
  },
  /* 区画に入ると流れる放送 (話は進まない)。after の場面を終えてから、until の場面を終えるまで。1回地図を開いているあいだに1度ずつ。
     同じ放送を、区画ごとに読点の位置だけ変える (読んでいるのは録音でなく瑠璃。声のファイルも別になる)。
     2つ聞いたら、紫苑が手がかりを言う (hint) */
  ambient: {
    after: 'c1-arrive', until: 'c1-fork',
    zones: {
      H: [{ who: 'ruri', pa: true, text: 'ただいま館内が、大変混み合っております。順路どおりに、お進みください。' }],
      B: [{ who: 'ruri', pa: true, text: 'ただいま、館内が大変、混み合っております。順路どおりに、お進みください。' }],
      C: [{ who: 'ruri', pa: true, text: 'ただいま、館内が大変混み合っております。順路どおりに、お進み、ください。' }]
    },
    hint: [
      { who: 'shion', text: '同じ放送。言葉は、一字も変わってない。' },
      { who: 'shion', text: '録音じゃない。息つぎの場所が、毎回ちょっとずつ違う。', face: 'surprised' },
      { who: 'shion', text: '……誰かが、今も読んでるんだ。' },
      { who: 'shion', text: '北の方のスピーカーだけ、音がざらついてる。' }
    ]
  },
  spawn: { 'c1-arrive': [16, 15], 'c1-fork': [16, 14], 'c1-ruri': [20, 4],
    'c1-abyss': [29, 4], 'c1-close': [29, 4], done: [29, 4] },
  guides: {},
  /* 床の順路の矢印 [x, y, 向き]: 入口 → 広場 → 西 → 東 → 広場、とぐるりと回る輪 (北へは向かない) */
  route: [[16, 14, 'N'], [16, 11, 'W'], [13, 11, 'W'], [9, 10, 'W'], [5, 10, 'W'], [3, 9, 'E'], [7, 9, 'E'], [12, 9, 'E'],
    [16, 9, 'E'], [20, 9, 'E'], [24, 9, 'E'], [28, 9, 'E'], [30, 10, 'W'], [26, 11, 'W'], [22, 11, 'W'], [19, 11, 'W']],
  /* 調べられる物: 話の進み具合と関係なく、近くで「調べる」と読める (読まなくても進める) */
  looks: [
    { at: '2', name: '案内板', lines: [
      { who: 'sys', text: '> 案内板: 本日の催し' },
      { who: 'sys', text: '> 「団体のお客さま、ご来館」' },
      { who: 'sys', text: '> 日付: 14,203日前' }
    ] },
    { at: '1', name: '張り紙', lines: [
      { who: 'sys', text: '> 張り紙: 「混雑時は、係員の案内に従ってください」' },
      { who: 'sys', text: '> 下の段は、はがれている' }
    ] },
    { at: '3', name: '点検票', lines: [
      { who: 'sys', text: '> 放送設備の点検票' },
      { who: 'sys', text: '> 館内放送の系統 …… 正常' },
      { who: 'sys', text: '> 避難放送の系統 …… 故障 (14,203日前から)' }
    ] },
    { at: '4', name: '名簿', lines: [
      { who: 'sys', text: '> 本日の団体: 34名' },
      { who: 'sys', text: '> 担当: 案内係 瑠璃' },
      { who: 'sys', text: '> 出口での人数の確認 …… 記入なし' }
    ] }
  ],
  /* 記録の断片: 止められた 513 体 (3584〜4096番) の誰かの、最後の一手の写し。拾うと進み具合 (found) に残る。5章の保管庫で回収する */
  fragments: [
    { at: 'f', id: 'u3611', unit: 3611, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3611' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' }
    ] },
    { at: 'h', id: 'u3740', unit: 3740, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3740' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' }
    ] }
  ],
  goals: { 'c1-arrive': '水族館に入る', 'c1-fork': '放送が途切れる場所を探す',
    'c1-ruri': '放送の声のする方へ', 'c1-abyss': '瑠璃と一緒に、深淵と向き合う', 'c1-close': '瑠璃の放送を聞く',
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
  if (map.rects) {
    for (const r of map.rects) if (p.x >= r.x0 && p.x < r.x1 + 1 && p.y >= r.y0 && p.y < r.y1 + 1) return r.z;
  }
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
