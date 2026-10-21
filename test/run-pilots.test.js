/* 勝ち抜き戦の挑む子 (run-pilots.js): はじめのプロトコル (弱いもの) が固定でドラフトは2回・外れない・専用パッチが効く */
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = async () => ({ R: await import('../js3d/run.js'), P: await import('../js3d/run-pilots.js') });
const NAMES = ['FIRE', 'WATER', 'SPEED', 'DARKNESS', 'HATE', 'SMOKE', 'LIFE', 'LIGHT', 'PLAGUE', 'METAL', 'LOVE', 'DEATH', 'PSYCHIC', 'ASSIMILATION', 'APATHY', 'UNITY'];
const seq = () => { let i = 0; return () => ((i++ * 0.37) % 1); };

test('4人のはじめのプロトコルは、どれも弱いプロトコル (勝率 0.44 未満) で重ならない', async () => {
  const { P } = await load();
  const { PROTOCOL_STRENGTH } = await import('../js3d/protocol-strength.js');
  const starts = P.PILOTS.map(p => p.start);
  assert.strictEqual(new Set(starts).size, 4);
  for (const n of starts) assert.ok(PROTOCOL_STRENGTH[n] < 0.44, n);
});

test('挑む子は値を下げない (弱いプロトコルに替えたので)', async () => {
  const { R } = await load();
  const run = { ...R.newRun(NAMES, seq(), 0, 'normal', 'asagi'), deck: ['LIGHT', 'SPEED', 'FIRE'], phase: 'battle', opp: { deck: ['DEATH', 'LOVE', 'METAL'], level: 1 } };
  assert.strictEqual(R.battleOpts(run, 0).perks, undefined);
});

test('挑む子を選ぶと、はじめのプロトコルが左に入っていてドラフトは2回', async () => {
  const { R } = await load();
  let run = R.newRun(NAMES, seq(), 0, 'normal', 'asagi');
  assert.strictEqual(run.pilot, 'asagi');
  assert.deepStrictEqual(run.deck, ['LIGHT']);
  assert.ok(!run.offers.includes('LIGHT'));
  run = R.draftPick(run, run.offers[0], NAMES, seq());
  assert.strictEqual(run.phase, 'draft');
  run = R.draftPick(run, run.offers[0], NAMES, seq());
  assert.strictEqual(run.phase, 'patch');
  assert.strictEqual(run.deck.length, 3);
  assert.strictEqual(run.deck[0], 'LIGHT');
});

test('選ばなければいままでどおり / カオスでは挑む子は付かない', async () => {
  const { R } = await load();
  const plain = R.newRun(NAMES, seq(), 0);
  assert.strictEqual(plain.pilot, undefined);
  assert.deepStrictEqual(plain.deck, []);
  const chaos = R.newRun(NAMES, seq(), 0, 'chaos', 'shion');
  assert.strictEqual(chaos.pilot, undefined);
});

test('はじめのプロトコルは精鋭の入れ替えで外せない', async () => {
  const { R } = await load();
  const run = { ...R.newRun(NAMES, seq(), 0, 'normal', 'yamabuki'), deck: ['UNITY', 'SPEED', 'LIFE'], phase: 'reward', offers: ['DEATH'] };
  assert.deepStrictEqual(R.applyReward(run, { type: 'swap', add: 'DEATH', remove: 'UNITY' }, NAMES, seq()).deck, ['UNITY', 'SPEED', 'LIFE']);
  assert.deepStrictEqual(R.applyReward(run, { type: 'swap', add: 'DEATH', remove: 'SPEED' }, NAMES, seq()).deck, ['UNITY', 'DEATH', 'LIFE']);
});

test('専用パッチ: 紫苑は相手の手札 −1、杏は先攻、瑠璃は休憩の回復 +3、茜は除去が安い', async () => {
  const { R } = await load();
  const base = (pilot) => ({ ...R.newRun(NAMES, seq(), 0, 'normal', pilot), deck: [R.newRun(NAMES, seq(), 0, 'normal', pilot).deck[0] || 'FIRE', 'SPEED', 'LIFE'], phase: 'battle', opp: { deck: ['DEATH', 'LOVE', 'METAL'], level: 1 } });
  assert.deepStrictEqual(R.battleOpts(base('shion'), 0).handSize, [5, 4]);
  assert.deepStrictEqual(R.battleOpts(base(null), 0).handSize, [5, 5]);
  assert.strictEqual(R.battleOpts(base('yamabuki'), 0).first, 0);
  assert.strictEqual(R.battleOpts(base(null), 0).first, undefined);
  assert.strictEqual(R.healAmount(base('asagi')), R.healAmount(base(null)) + 3);
  assert.strictEqual(R.removePrice({ ...base('nadeshiko'), removeCost: 5 }), 2);
  assert.strictEqual(R.removePrice({ ...base('nadeshiko'), removeCost: 3 }), 1);
});

test('杏には INITIATIVE (同じ効き目) が候補に出ない', async () => {
  const { R } = await load();
  const run = { ...R.newRun(NAMES, seq(), 0, 'normal', 'yamabuki'), deck: ['FIRE', 'SPEED', 'LIFE'] };
  for (let k = 0; k < 40; k++) {
    let i = k;
    const offers = R.patchOffersFor(run, () => ((i++ * 0.137) % 1));
    assert.ok(!offers.includes('initiative'));
  }
});
