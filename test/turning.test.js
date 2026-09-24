import test from 'node:test';
import assert from 'node:assert/strict';
import { advantage, advantageSeries, turningPoints } from '../js3d/turning.js';

test('優勢は -1..1。勝ち負けの盤面は ±1', () => {
  assert.equal(advantage(0), 0);
  assert.equal(advantage(1e9), 1);
  assert.equal(advantage(-1e9), -1);
  assert.ok(advantage(600) > 0.7 && advantage(600) < 0.8);
  assert.ok(advantage(-300) < 0);
  assert.equal(advantage(NaN), 0);
});

test('大きく動いた手を、動きの大きい順に選んで手の順に並べる', () => {
  const adv = advantageSeries([0, 30, -400, -380, 200, 250, 1e9]);
  const tp = turningPoints(adv, 2);
  assert.deepEqual(tp.map(t => t.index), [1, 3]);
  assert.ok(tp[0].swing < 0 && tp[1].swing > 0);
});

test('決着の一手と、小さな動きは分かれ目にしない', () => {
  const adv = advantageSeries([0, 20, 40, 60, 1e9]);
  assert.deepEqual(turningPoints(adv), []);
});
