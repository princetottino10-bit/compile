/* サーバーで週替わり3連戦のクリアを確かめる写し (supabase/functions/_shared/weekly-set.js) が、
   画面側 (js3d/weekly.js) と同じ9つ・同じ相手を返すか */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const W = await import('../js3d/weekly.js');
const S = await import('../supabase/functions/_shared/weekly-set.js');
const A = await import('../js3d/aidecks.js');
const names = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8')).protocols.map(p => p.name);

test('週の9つと相手が画面側と同じ (20週ぶん)', () => {
  for (let i = 0; i < 20; i++) {
    const key = 'W' + (2900 + i);
    assert.deepEqual(S.weeklySet(key, names), W.weeklySet(key, names));
  }
});

test('相手のデッキの定数が aidecks.js と同じ', () => {
  assert.deepEqual(S.STRONGEST_AI, A.STRONGEST_AI);
  assert.equal(S.CHALLENGER_BASE, A.CHALLENGER_BASE);
  assert.deepEqual(S.CHALLENGERS.map(c => c.deck), A.CHALLENGERS.map(c => c.deck));
});

test('週替わり: Main 3 / Aux 3 は W2967 から。W2966 までは前の30種だけ', async () => {
  const cards = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
  const late = new Set(cards.protocols.filter(p => p.set === 'Main 3' || p.set === 'Aux 3').map(p => p.name));
  const old = names.filter(n => !late.has(n));
  for (let w = 2900; w <= 2966; w++) {
    const s = W.weeklySet('W' + w, names);
    assert.ok(s.nine.concat(s.opponents[0].deck).every(n => !late.has(n)), 'W' + w);
    assert.deepEqual(s, W.weeklySet('W' + w, old));     // 前の30種で引いたのと同じ
  }
  let seen = false;
  for (let w = 2967; w < 3067; w++) {
    const s = W.weeklySet('W' + w, names);
    assert.deepEqual(s, S.weeklySet('W' + w, names));
    if (s.nine.some(n => late.has(n))) seen = true;
  }
  assert.ok(seen);
});
