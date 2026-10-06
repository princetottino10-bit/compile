import test from 'node:test';
import assert from 'node:assert/strict';
import { playScore, rankOf } from '../js3d/hype.js';
import { creditGain, RUN_BONUS_MAX } from '../js3d/run.js';

test('ふつうの1手 (値3を置くだけ) では何も出ない', () => {
  assert.equal(rankOf(playScore({ swing: 3, chain: 0, compiled: false })), null);
});
test('チェーン・コンパイル・大きな振れ幅で段が上がる', () => {
  assert.equal(rankOf(playScore({ swing: 7, chain: 0, compiled: false })).name, 'NICE');
  assert.equal(rankOf(playScore({ swing: 5, chain: 3, compiled: false })).name, 'GREAT');      // 5 + 6
  assert.equal(rankOf(playScore({ swing: 0, chain: 0, compiled: true })).name, 'NICE');         // 8
  assert.equal(rankOf(playScore({ swing: 10, chain: 3, compiled: true })).name, 'INSANE');      // 10 + 6 + 8
});
test('勝ち抜き戦の試合中ボーナスはクレジットに足され、上限で止まる', () => {
  const run = { route: 'normal', patches: [] };
  assert.equal(creditGain(run, 1, 2) - creditGain(run, 1), 2);
  assert.equal(creditGain(run, 1, 99) - creditGain(run, 1), RUN_BONUS_MAX);
});
