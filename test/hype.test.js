import test from 'node:test';
import assert from 'node:assert/strict';
import { playScore, rankOf } from '../js3d/hype.js';
import { creditGain, RUN_BONUS_MAX } from '../js3d/run.js';

test('小さな1手 (値3を置くだけ) では何も出ない', () => {
  assert.equal(rankOf(playScore({ swing: 3, chain: 0, compiled: false })), null);
});
test('チェーン・コンパイル・大きな振れ幅で段が上がる', () => {
  assert.equal(rankOf(playScore({ swing: 5, chain: 0, compiled: false })).name, 'NICE');
  assert.equal(rankOf(playScore({ swing: 3, chain: 3, compiled: false })).name, 'GREAT');      // 3 + 6
  assert.equal(rankOf(playScore({ swing: 0, chain: 0, compiled: true })).name, 'NICE');         // 8
  assert.equal(rankOf(playScore({ swing: 6, chain: 2, compiled: true })).name, 'EXCELLENT');    // 6 + 3 + 8
  assert.equal(rankOf(playScore({ swing: 7, chain: 3, compiled: true })).name, 'INSANE');       // 7 + 6 + 8
});
test('試合中スコア: 1手の点と、300 点ごとのクレジット (上限つき)', async () => {
  const { actionPoints, scoreCredits, comboMult } = await import('../js3d/run-score.js');
  assert.equal(actionPoints({ swing: 5, chain: 0, compiled: false }, 0), 50);
  assert.equal(actionPoints({ swing: 5, chain: 3, compiled: false }, 0), 100);              // チェーン 3 で ×2
  assert.equal(actionPoints({ swing: 5, chain: 0, compiled: true }, 4), Math.round(150 * comboMult(4)));
  assert.equal(scoreCredits(299), 0);
  assert.equal(scoreCredits(650), 2);
  assert.equal(scoreCredits(99999), RUN_BONUS_MAX);
});
test('勝ち抜き戦の試合中ボーナスはクレジットに足され、上限で止まる', () => {
  const run = { route: 'normal', patches: [] };
  assert.equal(creditGain(run, 1, 2) - creditGain(run, 1), 2);
  assert.equal(creditGain(run, 1, 99) - creditGain(run, 1), RUN_BONUS_MAX);
});
