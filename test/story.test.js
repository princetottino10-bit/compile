import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const S = await import('../js3d/story.js');
const cards = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const PROTOS = new Set(cards.protocols.map(p => p.name));

test('章と場面: id は重ならず、会話には行が、対戦にはデッキがある', () => {
  const ids = S.CHAPTERS.flatMap(c => c.nodes.map(n => n.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const c of S.CHAPTERS) {
    assert.ok(c.title && c.name && c.nodes.length);
    for (const n of c.nodes) {
      assert.ok(['scene', 'battle'].includes(n.kind), n.id);
      assert.ok(n.title, n.id);
      if (n.kind === 'scene') {
        assert.ok(n.lines.length > 0, n.id);
        for (const l of n.lines) assert.ok(S.SPEAKERS[l.who] && l.text, n.id + ' ' + l.who);
      } else {
        assert.equal(n.me.length, 3, n.id);
        assert.equal(n.opp.length, 3, n.id);
        for (const p of n.me.concat(n.opp)) assert.ok(PROTOS.has(p), n.id + ' ' + p);
        assert.equal(new Set(n.me.concat(n.opp)).size, 6, n.id + ' 自分と相手のプロトコルは重ならない');
        assert.ok([0, 1, 2].includes(n.level), n.id);
        assert.ok([1, 2, 3].includes(n.win), n.id);
        assert.ok(n.oppName, n.id);
      }
    }
  }
});

test('進み具合: はじめは最初の場面だけ入れる。クリアすると次が開く', () => {
  const s0 = S.blankStory();
  const [a, b, c] = S.CHAPTERS[0].nodes;
  assert.equal(S.currentNode(s0).id, a.id);
  assert.ok(S.canEnter(s0, a.id));
  assert.ok(!S.canEnter(s0, b.id));
  const s1 = S.clearNode(s0, a.id);
  assert.notEqual(s1, s0, '元の状態は変えない');
  assert.deepEqual(s0.cleared, []);
  assert.equal(S.currentNode(s1).id, b.id);
  assert.ok(S.canEnter(s1, a.id), 'クリアした会話はもう一度見られる');
  assert.ok(S.canEnter(s1, b.id));
  assert.ok(!S.canEnter(s1, c.id));
  assert.equal(S.clearNode(s1, a.id).cleared.length, 1, '同じ場面を2回数えない');
});

test('対戦の始まりと終わり: pending を覚え、勝てばクリア、負ければそのまま', () => {
  const battle = S.CHAPTERS[0].nodes.find(n => n.kind === 'battle');
  let s = S.blankStory();
  for (const n of S.CHAPTERS[0].nodes) { if (n.id === battle.id) break; s = S.clearNode(s, n.id); }
  const started = S.startBattle(s, battle.id);
  assert.equal(started.pending, battle.id);
  assert.equal(S.pendingBattle(started).id, battle.id);
  const lost = S.finishBattle(started, false);
  assert.equal(lost.pending, null);
  assert.ok(!S.isCleared(lost, battle.id));
  const won = S.finishBattle(started, true);
  assert.ok(S.isCleared(won, battle.id));
  assert.equal(S.startBattle(S.blankStory(), battle.id).pending, null, 'まだ入れない対戦は始めない');
});

test('章のクリア: 全部の場面をクリアすると chapterCleared', () => {
  let s = S.blankStory();
  const ch = S.CHAPTERS[0];
  assert.ok(!S.chapterCleared(s, ch.id));
  for (const n of ch.nodes) s = S.clearNode(s, n.id);
  assert.ok(S.chapterCleared(s, ch.id));
  assert.equal(S.currentNode(s), null, '全部終われば今の場面は無い');
});

test('保存と読み込み: 壊れた保存は最初から。知らない id は捨てる', () => {
  const s = S.clearNode(S.blankStory(), S.CHAPTERS[0].nodes[0].id);
  S.saveStory(s);
  assert.deepEqual(S.loadStory().cleared, s.cleared);
  localStorage.setItem(S.STORY_KEY, '{broken');
  assert.deepEqual(S.loadStory().cleared, []);
  localStorage.setItem(S.STORY_KEY, JSON.stringify({ v: 1, cleared: ['nope', S.CHAPTERS[0].nodes[0].id], pending: 'nope' }));
  const t = S.loadStory();
  assert.deepEqual(t.cleared, [S.CHAPTERS[0].nodes[0].id]);
  assert.equal(t.pending, null);
});
