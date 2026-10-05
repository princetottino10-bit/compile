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
const tsume = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../data/tsume.json', import.meta.url), 'utf8'));

test('章と場面: id は重ならず、会話には行が、対戦にはデッキがある', () => {
  const ids = S.CHAPTERS.flatMap(c => c.nodes.map(n => n.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const c of S.CHAPTERS) {
    assert.ok(c.title && c.name && c.nodes.length);
    for (const n of c.nodes) {
      assert.ok(['scene', 'battle', 'tsume'].includes(n.kind), n.id);
      assert.ok(n.title, n.id);
      if (n.kind === 'scene') {
        assert.ok(n.lines.length > 0, n.id);
        for (const l of n.lines) assert.ok(S.SPEAKERS[l.who] && l.text, n.id + ' ' + l.who);
      } else if (n.kind === 'tsume') {
        assert.ok(n.puzzle ? (n.puzzle.goal && n.puzzle.spec && n.puzzle.steps.length) : tsume.some(t => t.id === n.tsume), n.id + ' の問題がある (場面に持つか、data/tsume.json の id)');
        assert.ok(n.oppName && n.winLines.length && n.loseLines.length, n.id);
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
  assert.equal(S.currentNode(s).id, S.CHAPTERS[1].nodes[0].id, '次の章の最初の場面へ進む');
  assert.equal(S.chapterOf(s).id, S.CHAPTERS[1].id);
  for (const c of S.CHAPTERS) for (const n of c.nodes) s = S.clearNode(s, n.id);
  assert.equal(S.currentNode(s), null, '全部終われば今の場面は無い');
  assert.equal(S.chapterOf(s).id, S.CHAPTERS[S.CHAPTERS.length - 1].id, '全部終われば最後の章');
});

test('場面の id は章をまたいでも重ならない。選択肢は、話が先へ進む道を1つ以上持つ', () => {
  const ids = S.CHAPTERS.flatMap(c => c.nodes.map(n => n.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const c of S.CHAPTERS) for (const n of c.nodes) {
    if (!n.choice) continue;
    assert.ok(n.choice.options.length >= 2, n.id);
    assert.ok(n.choice.options.some(o => !o.again), n.id + ' は選び直しの道しかない');
  }
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

test('進み具合を合わせる: クリアした場面は足し合わせ、「最初から」より前のものは足さない', () => {
  const a = { v: 1, cleared: ['c0-wake'], pending: null, resetAt: 0 };
  const b = { v: 1, cleared: ['c0-wake', 'c0-practice'], pending: null, resetAt: 0 };
  assert.deepEqual(S.mergeStory(a, b).cleared.sort(), ['c0-practice', 'c0-wake']);
  /* 片方で「最初から」を押した: 押す前の進み具合は戻ってこない */
  const reset = { v: 1, cleared: [], pending: null, resetAt: 100 };
  assert.deepEqual(S.mergeStory(reset, b).cleared, []);
  assert.deepEqual(S.mergeStory(b, reset).cleared, []);
  /* 最初からやり直したあとの進み具合は残る */
  assert.deepEqual(S.mergeStory({ ...reset, cleared: ['c0-wake'] }, b).cleared, ['c0-wake']);
  /* 知らない場面の id は捨てる */
  assert.deepEqual(S.mergeStory({ ...a, cleared: ['nope'] }, a).cleared, ['c0-wake']);
});

test('保存は、保存してある進み具合と合わせてから書く (ほかの端末の分を消さない)', () => {
  localStorage.removeItem(S.STORY_KEY);
  S.saveStory({ v: 1, cleared: ['c0-wake', 'c0-practice'], pending: null, resetAt: 0 });
  const after = S.saveStory({ v: 1, cleared: ['c0-wake'], pending: null, resetAt: 0 });
  assert.deepEqual(after.cleared.sort(), ['c0-practice', 'c0-wake']);
  /* 「最初から」は消せる */
  assert.deepEqual(S.saveStory(S.blankStory(Date.now())).cleared, []);
  localStorage.removeItem(S.STORY_KEY);
});

test('台本: 1つの箱は40字まで (一目で読める量。.claude/skills/story-craft の決まり 1)', () => {
  const over = [];
  for (const c of S.CHAPTERS) for (const n of c.nodes) {
    const ls = [...(n.lines || []), ...(n.winLines || []), ...(n.loseLines || []),
      ...((n.choice && n.choice.options.flatMap(o => [...(o.lines || []), ...(o.ifAgain || [])])) || [])];
    for (const l of ls) if ([...l.text].length > 40) over.push(n.id + ': ' + l.text);
  }
  assert.deepEqual(over, []);
});
