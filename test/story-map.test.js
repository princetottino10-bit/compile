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
