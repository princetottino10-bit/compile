import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, hashOf, cleanRemote } from '../js3d/cloudsave.js';

const best = (reached, life) => JSON.stringify({ reached, life });

test('アカウントに何も無ければ、こちらを送る', () => {
  const d = decide({ compileSettings: '{"sfx":50}' }, null, null);
  assert.equal(d.apply, null);
  assert.deepEqual(d.push, { compileSettings: '{"sfx":50}' });
});

test('この端末で初めて: アカウントを正にして、無い項目だけ足す。RUN の最高記録は良い方', () => {
  const local = { compileSettings: 'L', compileOppLast: 'L', compileRunBest: best(9, 3) };
  const remote = { data: { compileSettings: 'R', compileRunBest: best(5, 5) }, at: 100 };
  const d = decide(local, remote, null);
  assert.deepEqual(d.apply, { compileSettings: 'R', compileOppLast: 'L', compileRunBest: best(9, 3) });
  assert.deepEqual(d.push, d.apply);
});

test('前回から変わっていなくて、アカウントが新しければ読む', () => {
  const local = { compileSettings: 'A' };
  const meta = { hash: hashOf(local), at: 100 };
  const d = decide(local, { data: { compileSettings: 'B' }, at: 200 }, meta);
  assert.deepEqual(d.apply, { compileSettings: 'B' });
  assert.equal(d.push, null);
});

test('どちらも変わっていなければ何もしない', () => {
  const local = { compileSettings: 'A' };
  const d = decide(local, { data: { compileSettings: 'A' }, at: 100 }, { hash: hashOf(local), at: 100 });
  assert.equal(d.apply, null);
  assert.equal(d.push, null);
});

test('こちらで変わっていれば送る (RUN の最高記録はアカウントの方が良ければそちら)', () => {
  const local = { compileSettings: 'new', compileRunBest: best(3, 1) };
  const meta = { hash: hashOf({ compileSettings: 'old' }), at: 100 };
  const d = decide(local, { data: { compileSettings: 'other', compileRunBest: best(9, 2) }, at: 200 }, meta);
  assert.deepEqual(d.push, { compileSettings: 'new', compileRunBest: best(9, 2) });
  assert.deepEqual(d.apply, d.push);
});

test('アカウントの中身は知っている項目・文字列だけ通す', () => {
  assert.deepEqual(cleanRemote({ compileSettings: 'x', evil: 'y', compileRun: 5 }), { compileSettings: 'x' });
  assert.deepEqual(cleanRemote(null), {});
});

test('実績は両方の端末で取った分を合わせる', () => {
  const local = { compileTrophies: JSON.stringify({ a: 5, b: 9 }) };
  const meta = { hash: 'old', at: 100 };
  const d = decide(local, { data: { compileTrophies: JSON.stringify({ b: 3, c: 7 }) }, at: 200 }, meta);
  assert.deepEqual(JSON.parse(d.push.compileTrophies), { a: 5, b: 3, c: 7 });
});
