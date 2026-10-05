import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTurning } from '../js3d/review.js';
import { catchUpText, watchGate, watchPaused } from '../js3d/watchtools.js';

test('感想戦: 前後の分かれ目へ', () => {
  const tp = [{ index: 12 }, { index: 3 }, { index: 20 }];
  assert.equal(nextTurning(tp, 0, 1), 3);
  assert.equal(nextTurning(tp, 3, 1), 12);
  assert.equal(nextTurning(tp, 20, 1), null);
  assert.equal(nextTurning(tp, 12, -1), 3);
  assert.equal(nextTurning(tp, 3, -1), null);
  assert.equal(nextTurning([], 5, 1), null);
});

test('オンラインの観戦: 途中から入ったときのまとめ (来ているデータだけで)', () => {
  const g = (lines, comp, turn = 0) => ({ names: ['あお', 'みどり'], game: { turn, winner: null, lines,
    protocols: [[{ name: 'FIRE', compiled: comp[0] > 0 }, { name: 'WATER', compiled: comp[0] > 1 }, { name: 'SPEED' }],
      [{ name: 'DEATH', compiled: comp[1] > 0 }, { name: 'LIFE' }, { name: 'LIGHT' }]] } });
  const empty = [[[], []], [[], []], [[], []]];
  assert.equal(catchUpText(g(empty, [0, 0])), '', '始まったばかりなら出さない');
  const t = catchUpText(g([[[{ uid: 'a' }], []], [[], []], [[], []]], [2, 1], 1));
  assert.match(t, /あお 2/);
  assert.match(t, /みどり 1/);
  assert.match(t, /みどり の番/);
  assert.equal(catchUpText(null), '');
});

test('観戦の一時停止: 止めていなければ待たない', async () => {
  assert.equal(watchPaused(), false);
  await watchGate();
});
