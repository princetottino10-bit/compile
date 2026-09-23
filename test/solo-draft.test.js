/* シングルプレイのルール: 使うプロトコルの範囲・ドラフトの順番・CPU の選び方 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const load = () => import('../js3d/solodraft.js');

function seeded(seed) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

test('範囲: Main 1 だけ / Main 1+2 / 全部', async () => {
  const D = await load();
  const main1 = D.poolNames(cards.protocols, 'main1');
  assert.equal(main1.length, 12);
  assert.ok(main1.includes('DARKNESS') && !main1.includes('HATE'));
  const main12 = D.poolNames(cards.protocols, 'main12');
  assert.ok(main12.length > 12 && main12.every(n => cards.protocols.find(p => p.name === n).set.startsWith('Main')));
  assert.equal(D.poolNames(cards.protocols, 'all').length, cards.protocols.length);
});

test('候補の数: 各自3つ + BAN ぶん以上、範囲の数以下', async () => {
  const D = await load();
  assert.equal(D.clampCandidates(0, 0, 12), 12, '0 は全部');
  assert.equal(D.clampCandidates(8, 2, 12), 10, 'BAN 各2 なら 10 以上');
  assert.equal(D.clampCandidates(12, 0, 30), 12);
  assert.equal(D.clampCandidates(40, 0, 12), 12);
});

test('ドラフトの順番はオンラインと同じ (BAN を交互に → 1-2-2-1)', async () => {
  const D = await load();
  const steps = D.draftSteps(1, 1);
  assert.deepEqual(steps.map(s => s.kind + s.side + 'x' + s.n),
    ['ban1x1', 'ban0x1', 'pick1x1', 'pick0x2', 'pick1x2', 'pick0x1']);
  const picked = [0, 0];
  for (const s of steps) if (s.kind === 'pick') picked[s.side] += s.n;
  assert.deepEqual(picked, [3, 3], '各自ちょうど3つ');
});

test('ランダム: 3つずつ、重ならない', async () => {
  const D = await load();
  const names = D.poolNames(cards.protocols, 'main1');
  const { me, ai } = D.randomDecks(names, seeded(7));
  assert.equal(me.length, 3); assert.equal(ai.length, 3);
  assert.ok(me.every(n => !ai.includes(n)) && me.concat(ai).every(n => names.includes(n)));
});

test('CPU のドラフト: 候補の中から重ならずに選び、強いほど選びやすい', async () => {
  const D = await load();
  const pool = ['A', 'B', 'C', 'D', 'E'];
  const strength = { A: 0.40, B: 0.62, C: 0.50, D: 0.55, E: 0.45 };
  assert.deepEqual(D.cpuDraftPick(pool, 2, 2, strength, seeded(1)), ['B', 'D'], 'つよい以上は強い順');
  const easy = D.cpuDraftPick(pool, 3, 0, strength, seeded(3));
  assert.equal(new Set(easy).size, 3);
  assert.ok(easy.every(n => pool.includes(n)));
  /* ふつう: 一番強い B が一番弱い A より多く選ばれる */
  const count = { A: 0, B: 0 };
  const rnd = seeded(11);
  for (let i = 0; i < 400; i++) { const [x] = D.cpuDraftPick(pool, 1, 1, strength, rnd); if (x in count) count[x]++; }
  assert.ok(count.B > count.A * 3, JSON.stringify(count));
});
