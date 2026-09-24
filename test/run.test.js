/* 勝ち抜き戦 (run.js): ドラフト → 8戦 → 報酬、ライフはコンパイルされた回数だけ減る */
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = () => import('../js3d/run.js');
const NAMES = ['FIRE', 'WATER', 'SPEED', 'DARKNESS', 'HATE', 'SMOKE', 'LIFE', 'LIGHT', 'PLAGUE', 'METAL', 'LOVE', 'DEATH'];
/* 決まった並びを返す乱数 (抽選を再現できるように) */
const seq = () => { let i = 0; return () => ((i++ * 0.37) % 1); };

async function drafted() {
  const R = await load();
  let run = R.newRun(NAMES, seq());
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  return { R, run };
}

test('3回選ぶとデッキができ、1戦目の相手が決まる (自分のプロトコルとは重ならない)', async () => {
  const { R, run } = await drafted();
  assert.equal(run.deck.length, 3);
  assert.equal(new Set(run.deck).size, 3, '同じプロトコルは2回出ない');
  assert.equal(run.phase, 'battle');
  assert.equal(run.opp.level, R.FLOORS[0].level);
  assert.ok(run.opp.deck.every(n => !run.deck.includes(n)));
  assert.equal(run.life, R.RUN_LIFE);
});

test('コンパイルされた回数だけライフが減る。勝てば次の階の報酬、負ければ同じ階をやり直す', async () => {
  const { R, run } = await drafted();
  const lost = R.finishBattle(run, false, 3, NAMES, seq());
  assert.equal(lost.life, R.RUN_LIFE - 3);
  assert.equal(lost.phase, 'battle');
  assert.equal(lost.floor, 0);
  assert.deepEqual(lost.opp, run.opp, 'やり直しは同じ相手');
  const won = R.finishBattle(lost, true, 1, NAMES, seq());
  assert.equal(won.life, R.RUN_LIFE - 4);
  assert.equal(won.phase, 'reward');
  assert.equal(won.floor, 1);
  assert.ok(won.offers.every(n => !won.deck.includes(n)));
});

test('報酬: 入れ替え・回復 (上限あり)。そのあと次の相手が決まる', async () => {
  const { R, run } = await drafted();
  const won = R.finishBattle(run, true, 2, NAMES, seq());
  const swapped = R.applyReward(won, { type: 'swap', add: won.offers[0], remove: won.deck[1] }, NAMES, seq());
  assert.ok(swapped.deck.includes(won.offers[0]));
  assert.ok(!swapped.deck.includes(won.deck[1]));
  assert.equal(swapped.phase, 'battle');
  const healed = R.applyReward(won, { type: 'heal' }, NAMES, seq());
  assert.equal(healed.life, Math.min(R.RUN_LIFE, won.life + R.RUN_HEAL));
});

test('ライフが 0 になったら終わり。8戦勝てばクリアで、どちらも最高記録に残る', async () => {
  const { R, run } = await drafted();
  const over = R.finishBattle(run, false, 99, NAMES, seq());
  assert.equal(over.phase, 'over');
  assert.equal(over.life, 0);
  let r = run;
  for (let f = 0; f < R.FLOORS.length; f++) {
    r = R.finishBattle(r, true, 0, NAMES, seq());
    if (r.phase === 'reward') r = R.applyReward(r, { type: 'skip' }, NAMES, seq());
  }
  assert.equal(r.phase, 'clear');
  assert.equal(R.loadBest().reached, R.FLOORS.length + 1);
  const bossFloor = R.prepareFloor({ ...run, floor: R.FLOORS.length - 1 }, NAMES, seq());
  assert.ok(bossFloor.opp.boss, '最後はボス (最強)');
});

test('相手のコンパイル回数を記録から数える (リコンパイル・効果で済ませたものも)', async () => {
  const R = await load();
  const st = { actionLog: ['P2: ライン1をコンパイル', 'P2: FIRE をコンパイル！', 'P1: ライン2をコンパイル',
    'P2: ライン1をコンパイル', 'P2: リコンパイル — 相手のデッキトップを獲得', 'P2: DIVERSITY をコンパイル完了にした！'] };
  assert.equal(R.compilesBy(st, 1), 3);
  assert.equal(R.compilesBy(st, 0), 1);
});

test('コンパイル回数はエンジンの集計 (state.tally) を優先する', async () => {
  const R = await load();
  assert.equal(R.compilesBy({ tally: { compiles: [1, 2] }, actionLog: [] }, 1), 2);
});
