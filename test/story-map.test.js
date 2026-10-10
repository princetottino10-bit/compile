import test from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js3d/story-map.js');
const S = await import('../js3d/story.js');

const upTo = (id) => {
  let s = S.blankStory();
  for (const n of S.CHAPTERS[0].nodes) { if (n.id === id) break; s = S.clearNode(s, n.id); }
  return s;
};

test('地図: どの行も同じ幅。出てくる印はすべて意味がある', () => {
  const rows = M.PROLOGUE.rows;
  assert.ok(rows.length >= 5);
  for (const r of rows) assert.equal(r.length, rows[0].length);
  for (const ch of rows.join('')) assert.ok(M.TILE[ch] !== undefined, '知らない印: ' + ch);
});

test('地図の出来事は、序章の場面をすべて使う', () => {
  const used = new Set(Object.values(M.PROLOGUE.events).map(e => e.node));
  for (const n of S.CHAPTERS[0].nodes) assert.ok(used.has(n.id), n.id + ' を使う出来事がない');
  for (const e of Object.values(M.PROLOGUE.events)) assert.ok(S.nodeById(e.node), e.node);
});

test('壁と扉: 壁はいつも通れない。扉は前の出来事を終えるまで閉じている', () => {
  const map = M.PROLOGUE;
  const wall = M.find(map, '#')[0];
  assert.equal(M.walkable(map, S.blankStory(), wall.x, wall.y), false);
  const doorA = M.find(map, 'a')[0];
  assert.equal(M.walkable(map, S.blankStory(), doorA.x, doorA.y), false, '練習の前は閉じている');
  assert.equal(M.walkable(map, upTo('c0-log'), doorA.x, doorA.y), true, '練習に勝てば開く');
  const gate = M.find(map, 'g')[0];
  assert.equal(M.walkable(map, upTo('c0-chief'), gate.x, gate.y), false);
  assert.equal(M.walkable(map, upTo('c0-escape'), gate.x, gate.y), true);
  assert.equal(M.walkable(map, S.blankStory(), -1, 0), false, '地図の外は通れない');
});

test('出てくる場所: 進み具合に合わせて、次の出来事のある区画に立つ', () => {
  const map = M.PROLOGUE;
  const inZone = (s) => M.zoneAt(map, M.spawnFor(map, s));
  assert.equal(inZone(S.blankStory()), 'A');
  assert.equal(inZone(upTo('c0-log')), 'A');
  assert.equal(inZone(upTo('c0-lock')), 'B');
  assert.equal(inZone(upTo('c0-gate')), 'B');
  assert.equal(inZone(upTo('c0-chief')), 'D');
  assert.equal(inZone(upTo('c0-escape')), 'D');
  for (const s of [S.blankStory(), upTo('c0-gate'), upTo('c0-chief')]) {
    const p = M.spawnFor(map, s);
    assert.ok(M.walkable(map, s, Math.floor(p.x), Math.floor(p.y)), '立つ所は歩ける');
  }
});

test('次にやること: 進み具合ごとに案内の文がある', () => {
  for (const n of S.CHAPTERS[0].nodes) assert.ok(M.objective(upTo(n.id)), n.id);
  let all = S.blankStory();
  for (const n of S.CHAPTERS[0].nodes) all = S.clearNode(all, n.id);
  assert.ok(M.objective(all));
});

test('当たり判定: 円が壁にめり込まないように、軸ごとに止める', () => {
  const map = M.PROLOGUE;
  const s = S.blankStory();
  const start = M.spawnFor(map, s);
  let p = { ...start };
  for (let i = 0; i < 200; i++) p = M.move(map, s, p, { x: -0.1, y: 0 }, 0.3);
  assert.ok(p.x >= 1 + 0.3 - 1e-9, '左の壁で止まる');
  assert.equal(p.y, start.y, '横に動いただけなら縦は変わらない');
});

test('道探し: 壁をよけて、開いた扉を通る。閉じた扉の先へは道がない', () => {
  const map = M.PROLOGUE;
  const cleared = upTo('c0-lock');       // 扉 a は開いている、b・d は閉じている
  const from = { x: 3.5, y: 2.5 };        // 目覚めの部屋
  const to = { x: 12.5, y: 1.5 };         // 端末室
  const path = M.findPath(map, cleared, from, to);
  assert.ok(path && path.length > 0, '道がある');
  const last = path[path.length - 1];
  assert.deepEqual(last, to, '最後は押した所');
  for (const p of path) assert.ok(M.walkable(map, cleared, Math.floor(p.x), Math.floor(p.y)), '道は歩けるマスだけ');
  assert.ok(path.some(p => Math.floor(p.x) === 7 && Math.floor(p.y) === 3), '扉 a を通る');
  assert.equal(M.findPath(map, cleared, from, { x: 29.5, y: 3.5 }), null, '閉じた扉の先には行けない');
  assert.equal(M.findPath(map, cleared, from, { x: 0.5, y: 0.5 }), null, '壁の中は行き先にならない');
  assert.deepEqual(M.findPath(map, cleared, from, { x: 3.8, y: 2.6 }), [{ x: 3.8, y: 2.6 }], '同じマスならそのまま');
});

test('1章の地図: どの行も同じ幅。出来事は1章の場面をすべて使い、案内係の前まで歩いて行ける', () => {
  const map = M.AQUARIUM;
  for (const r of map.rows) assert.equal(r.length, map.rows[0].length);
  for (const ch of map.rows.join('')) assert.ok(M.TILE[ch] !== undefined, '知らない印: ' + ch);
  const used = new Set(Object.values(map.events).map(e => e.node));
  for (const n of S.CHAPTERS[1].nodes) assert.ok(used.has(n.id), n.id + ' を使う出来事がない');
  assert.equal(M.mapFor('ch1'), map);
  let s = S.blankStory();
  for (const n of S.CHAPTERS[0].nodes) s = S.clearNode(s, n.id);
  const start = M.spawnFor(map, s);
  assert.equal(M.zoneAt(map, start), 'A');
  const r = M.find(map, 'R')[0];
  assert.equal(M.findPath(map, s, start, { x: r.x + 0.5, y: r.y + 1.5 }), null, '放送が途切れる場所を見つけるまで、出口ホールの扉は閉じている');
  let after = s;
  for (const id of ['c1-arrive', 'c1-fork']) after = S.clearNode(after, id);
  assert.ok(M.findPath(map, after, start, { x: r.x + 0.5, y: r.y + 1.5 }), '見つけたあとは、入口から案内係の前まで道がある');
  /* 寄り道: 入口から、大水槽・クラゲの部屋・記録の断片へ行ける (本筋の前でも) */
  for (const ch of ['f', '3']) { const m = M.find(map, ch)[0]; assert.ok(M.findPath(map, after, start, { x: m.x + 0.5, y: m.y + 0.5 }), ch); }
  for (const z of ['B', 'C', 'N']) assert.ok(map.rects.some(q => q.z === z), z);
  assert.equal(M.zoneAt(map, { x: 16.5, y: 4.5 }), 'N');
  for (const f of map.fragments) { assert.ok(M.find(map, f.at)[0], f.id); assert.ok(f.unit >= 3584 && f.unit <= 4096, '513 体の範囲の番号: ' + f.unit); }
  const dark = M.find(map, 'x')[0];
  assert.equal(M.walkable(map, s, dark.x, dark.y), false, '明かりの落ちた通路には入れない');
  assert.equal(M.objective(s), map.goals['c1-arrive']);
});

test('調べられる物 (looks): 置き場所が地図にあって歩ける。話の場面とは別', () => {
  const map = M.AQUARIUM;
  assert.ok(map.looks.length >= 1);
  const s = S.blankStory();
  for (const l of map.looks) {
    const m = M.find(map, l.at)[0];
    assert.ok(m, l.name + ' の置き場所');
    assert.equal(M.TILE[l.at], 'floor');
    assert.ok(l.lines.length >= 1 && l.lines.every(x => [...x.text].length <= 40), l.name);
    assert.equal(S.nodeById(l.at), null);
  }
});
