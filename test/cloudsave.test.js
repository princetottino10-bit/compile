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

/* 週替わり3連戦・RUN の途中の進み具合は、アカウントの古い中身で巻き戻さない (対戦中に同期が走って、勝ちが消えていた) */
const wk = (o) => JSON.stringify({ v: 1, week: 'W2960', attempt: 11, stage: 0, decks: [], phase: 'choose', clears: 0, bestStage: 2, submitted: false, ...o });
test('週替わり: 対戦中にアカウントの古い「負け」が来ても、進んでいる方を残す', () => {
  const local = { compileWeekly: wk({ stage: 0, decks: [['A', 'B', 'C']], phase: 'battle' }) };
  const meta = { hash: hashOf(local), at: 100 };
  const d = decide(local, { data: { compileWeekly: wk({ attempt: 10, phase: 'lost' }) }, at: 200 }, meta);
  assert.ok(d.apply === null || JSON.parse(d.apply.compileWeekly).phase === 'battle', '進んでいる方 (対戦中) を残す');
  const d2 = decide({ compileWeekly: wk({ stage: 1, phase: 'choose' }) }, { data: { compileWeekly: wk({ stage: 0, phase: 'battle' }) }, at: 300 },
    { hash: 'x', at: 100 });
  assert.equal(JSON.parse(d2.push.compileWeekly).stage, 1);
});
test('週替わり: 別の端末で先に進んでいれば、そちらを読む。週が変われば新しい週', () => {
  const local = { compileWeekly: wk({ stage: 0, phase: 'choose' }) };
  const meta = { hash: hashOf(local), at: 100 };
  const d = decide(local, { data: { compileWeekly: wk({ stage: 2, phase: 'battle', decks: [['A'], ['B'], ['C']] }) }, at: 200 }, meta);
  assert.equal(JSON.parse(d.apply.compileWeekly).stage, 2);
  const d2 = decide({ compileWeekly: wk({ stage: 2, phase: 'battle' }) }, { data: { compileWeekly: wk({ week: 'W2961', stage: 0, phase: 'idle', attempt: 0 }) }, at: 300 }, { hash: 'x', at: 100 });
  assert.equal(JSON.parse(d2.push.compileWeekly).week, 'W2961');
});
test('RUN: 同じ挑戦なら、対戦の記録が多い方を残す。新しく始めた挑戦はそちら', () => {
  const run = (o) => JSON.stringify({ v: 2, phase: 'map', startedAt: 1000, history: [], visited: [], ...o });
  const local = { compileRun: run({ history: [{ win: true }], visited: ['0-0', '1-0'], phase: 'map' }) };
  const meta = { hash: hashOf(local), at: 100 };
  const d = decide(local, { data: { compileRun: run({ phase: 'battle', visited: ['0-0'] }) }, at: 200 }, meta);
  assert.ok(d.apply === null || JSON.parse(d.apply.compileRun).history.length === 1);
  const d2 = decide(local, { data: { compileRun: run({ startedAt: 2000 }) }, at: 200 }, meta);
  assert.equal(JSON.parse(d2.apply.compileRun).startedAt, 2000);
});
test('RUN: ショップで買うなど、戦った数が同じでも保存の番号 (rev) が進んでいる方を残す', () => {
  const run = (o) => JSON.stringify({ v: 2, phase: 'shop', startedAt: 1000, history: [{ win: true }], visited: ['0-0'], ...o });
  const local = { compileRun: run({ rev: 5, credits: 9 }) };
  const meta = { hash: hashOf(local), at: 100 };
  const d = decide(local, { data: { compileRun: run({ rev: 7, credits: 2 }) }, at: 200 }, meta);
  assert.equal(JSON.parse(d.apply.compileRun).credits, 2, 'アカウントの方が先に進んでいる (買ったあと)');
});
test('デイリー: 新しい日の方。同じ日なら達成と進みを合わせる', () => {
  const day = (o) => JSON.stringify({ day: 100, progress: {}, done: [], ...o });
  const d = decide({ compileDaily: day({ progress: { a: 2 }, done: ['a'] }) }, { data: { compileDaily: day({ progress: { a: 1, b: 3 }, done: ['b'] }) }, at: 200 }, { hash: 'x', at: 100 });
  const m = JSON.parse(d.push.compileDaily);
  assert.deepEqual(m.progress, { a: 2, b: 3 });
  assert.deepEqual(m.done.sort(), ['a', 'b']);
  const d2 = decide({ compileDaily: day({ day: 99, done: ['x'] }) }, { data: { compileDaily: day({ day: 100 }) }, at: 200 }, { hash: 'x', at: 100 });
  assert.equal(JSON.parse(d2.push.compileDaily).day, 100);
});
