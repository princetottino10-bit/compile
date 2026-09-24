/* 再生するコマの切り出し (js3d/steps.js) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { meaningfulSteps } from '../js3d/steps.js';

/* 見た目の指紋はテスト用に「board」という文字列だけで決める */
const fp = (st) => (st ? st.board : '');
const st = (board, phase = 'action', turn = 0) => ({ board, phase, turn });

test('見た目が変わったところだけコマにする', () => {
  const steps = meaningfulSteps(st('a'), { trace: [{ st: st('a') }, { st: st('b'), uid: 'u1', msg: 'プレイ' }, { st: st('b') }] }, fp);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].uid, 'u1');
});

test('見た目が同じでもフェイズが変わったら1コマ残す (ターンの帯が効果より先に出ないように)', () => {
  const trace = [
    { st: st('b'), uid: 'u1', msg: '中段' },
    { st: st('b', 'start', 1) },
    { st: st('c', 'start', 1), uid: 'u2', msg: '上段' }
  ];
  const steps = meaningfulSteps(st('a'), { trace }, fp);
  assert.deepEqual(steps.map(s => !!s.phaseOnly), [false, true, false]);
  assert.equal(steps[0].uid, 'u1');                // 効果のコマがフェイズの切り替わりより先
});

test('見た目の変わらない効果の発動は、直前のコマに全部残す', () => {
  const trace = [
    { st: st('b') },
    { st: st('b'), uid: 'x', msg: '上段 発動' },
    { st: st('b'), uid: 'y', msg: '下段 発動' }
  ];
  const [only] = meaningfulSteps(st('a'), { trace }, fp);
  assert.deepEqual(only.acts.map(a => a.uid), ['x', 'y']);
  assert.equal(only.cue.uid, 'y');
});

test('最初のコマより前の発動は、次のコマの合図になる', () => {
  const trace = [{ st: st('a'), uid: 'x', msg: '中段 発動' }, { st: st('b') }];
  const [step] = meaningfulSteps(st('a'), { trace }, fp);
  assert.equal(step.cue.uid, 'x');
  assert.deepEqual(step.acts.map(a => a.uid), ['x']);
});

test('選択に答えた後の再実行は、いま出ている絵の続きから', () => {
  const trace = [{ st: st('b') }, { st: st('c') }, { st: st('d') }];
  const steps = meaningfulSteps(st('c'), { trace }, fp);
  assert.deepEqual(steps.map(s => s.st.board), ['d']);
});

test('記録がなければ空', () => {
  assert.deepEqual(meaningfulSteps(st('a'), { trace: [] }, fp), []);
  assert.deepEqual(meaningfulSteps(st('a'), null, fp), []);
});
