import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const S = await import('../js3d/story.js');
const SS = await import('../js3d/story-stars.js');

const battles = S.CHAPTERS.flatMap(c => c.nodes).filter(n => n.kind === 'battle');
const win = (o) => ({ win: true, turns: 10, oppCompiles: 0, refreshes: 0, ...o });

test('対戦の場面にはすべて★2・★3の条件があり、文が3つ出る', () => {
  for (const n of battles) {
    assert.equal((SS.STAR_RULES[n.id] || []).length, 2, n.id);
    assert.equal(SS.starTexts(n.id).length, 3, n.id);
  }
  /* 場面の id が変わったら、取った★ (帳簿の key) と合わなくなる */
  for (const id of Object.keys(SS.STAR_RULES)) assert.ok(battles.some(n => n.id === id), id + ' は対戦の場面');
  assert.equal(SS.starNodes().length, battles.length);
});

test('判定: 負けは★なし、かんたんで勝つと★1だけ、条件ごとに★2・★3', () => {
  assert.deepEqual(SS.judgeStars('c0-practice', { ...win(), win: false }, false), [false, false, false]);
  assert.deepEqual(SS.judgeStars('c0-practice', win(), true), [true, false, false]);
  /* 自分の手番は両者合わせた数の半分 (切り上げ)。8回以内 = 合わせて 15 まで */
  assert.deepEqual(SS.judgeStars('c0-practice', win({ turns: 15 }), false), [true, true, true]);
  assert.deepEqual(SS.judgeStars('c0-practice', win({ turns: 17, oppCompiles: 1 }), false), [true, false, false]);
  assert.deepEqual(SS.judgeStars('c1-abyss', win({ refreshes: 1 }), false), [true, true, false]);
  assert.deepEqual(SS.judgeStars('c0-chief', win({ oppCompiles: 1 }), false), [true, true, true]);
  assert.deepEqual(SS.judgeStars('c0-lock', win(), false), [false, false, false], '詰めコンパイルには★が無い');
});

test('取った★は帳簿から。★1 はクリアしていれば帳簿に無くても付く', () => {
  const story = { ...S.blankStory(), cleared: ['c0-practice'] };
  const log = [{ id: 'k:' + SS.starKey('c0-practice', 3) }, { id: 'k:' + SS.starKey('c0-chief', 2) }];
  assert.deepEqual(SS.earnedStars('c0-practice', log, story), [true, false, true]);
  assert.deepEqual(SS.earnedStars('c0-chief', log, story), [false, true, false]);
  assert.deepEqual(SS.earnedStars('c0-practice', [], null), [false, false, false]);
  const t = SS.starTotals(log, story);
  assert.equal(t.total, battles.length * 3);
  assert.equal(t.got, 3);
});
