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

async function drafted(patch) {
  const R = await load();
  let run = R.newRun(NAMES, seq());
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  /* はじめのパッチ (指定が無ければ取らない) */
  run = R.choosePatch(run, patch && run.patchOffers.includes(patch) ? patch : null, NAMES, seq());
  if (patch && !run.patches.includes(patch)) run = { ...run, patches: run.patches.concat(patch) };
  return { R, run };
}
/* 勝ったあと、報酬 → (パッチ) → 道 を通常戦で進める */
function advance(R, r, reward) {
  let x = R.applyReward(r, reward || { type: 'skip' }, NAMES, seq());
  if (x.phase === 'patch') x = R.choosePatch(x, null, NAMES, seq());
  if (x.phase === 'route') x = R.chooseRoute({ ...x, routeOffers: ['normal', 'elite'] }, 'normal', NAMES, seq());
  return x;
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
  assert.equal(swapped.phase, 'route', '2戦目は道を選ぶ');
  assert.equal(swapped.routeOffers.length, 2);
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
    if (r.phase === 'reward') r = advance(R, r);
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

test('はじめのパッチを3つから選ぶ (HEAT 5 では無し)', async () => {
  const R = await load();
  let run = R.newRun(NAMES, seq());
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  assert.equal(run.phase, 'patch');
  assert.equal(run.patchOffers.length, 3);
  const got = R.choosePatch(run, run.patchOffers[1], NAMES, seq());
  assert.deepEqual(got.patches, [run.patchOffers[1]]);
  assert.equal(got.phase, 'battle', '1戦目は道を選ばない');
  let hot = R.newRun(NAMES, seq(), 5);
  for (let k = 0; k < 3; k++) hot = R.draftPick(hot, hot.offers[0], NAMES, seq());
  assert.equal(hot.phase, 'battle');
  assert.equal(hot.maxLife, R.RUN_LIFE - 1, 'HEAT 1 以上はライフ −1');
});

test('パッチ: FIREWALL は最初の1回を防ぐ。FAILSAFE は1度だけライフ 1 で耐える。SELF REPAIR は勝つと +1', async () => {
  const { R, run } = await drafted('firewall');
  assert.equal(R.damageOf(run, 3), 2);
  assert.equal(R.damageOf(run, 0), 0);
  const fs = { ...run, patches: ['failsafe'] };
  assert.equal(R.lethal(fs, 99), false);
  const saved = R.finishBattle(fs, false, 99, NAMES, seq());
  assert.equal(saved.life, 1);
  assert.equal(saved.phase, 'battle');
  assert.equal(saved.failsafeUsed, true);
  assert.equal(R.lethal(saved, 1), true, '2回目は耐えない');
  const rep = R.finishBattle({ ...run, patches: ['repair'], life: 3 }, true, 1, NAMES, seq());
  assert.equal(rep.life, 3);
  const sweep = R.finishBattle({ ...run, patches: ['sweep'], life: 2 }, true, 0, NAMES, seq());
  assert.equal(sweep.life, 4);
});

test('パッチ: 試合のはじめ方 (先攻・手札・コントロール) と報酬の候補', async () => {
  const R = await load();
  const run = { patches: ['initiative', 'cache', 'root', 'jammer'] };
  assert.deepEqual(R.battleOpts(run, 0), { winCompiles: R.RUN_WIN_COMPILES, handSize: [6, 4], first: 0, startControl: 0 });
  assert.deepEqual(R.battleOpts({ patches: [] }, 0), { winCompiles: R.RUN_WIN_COMPILES, handSize: [5, 5] });
  const { run: r0 } = await drafted('search');
  assert.equal(R.finishBattle(r0, true, 0, NAMES, seq()).offers.length, 4);
});

test('精鋭戦は相手が1段強く、勝つと報酬のあとにパッチを選ぶ', async () => {
  const { R, run } = await drafted();
  const won = R.finishBattle(run, true, 0, NAMES, seq());
  const route = R.applyReward(won, { type: 'skip' }, NAMES, seq());
  const elite = R.chooseRoute({ ...route, routeOffers: ['elite', 'event'] }, 'elite', NAMES, seq());
  assert.equal(elite.phase, 'battle');
  assert.equal(elite.opp.level, R.FLOORS[1].level + 1);
  assert.ok(elite.opp.elite);
  const after = R.applyReward(R.finishBattle(elite, true, 0, NAMES, seq()), { type: 'skip' }, NAMES, seq());
  assert.equal(after.phase, 'patch');
  const next = R.choosePatch(after, after.patchOffers[0], NAMES, seq());
  assert.equal(next.patches.length, 1);
  assert.equal(next.phase, 'route');
});

test('イベント: 選んだあとで通常戦 (保管庫はパッチを選んだあと1段強い相手)', async () => {
  const { R, run } = await drafted();
  const won = R.finishBattle(run, true, 0, NAMES, seq());
  const route = R.applyReward(won, { type: 'skip' }, NAMES, seq());
  const ev = R.chooseRoute({ ...route, routeOffers: ['event', 'normal'] }, 'event', NAMES, seq());
  assert.equal(ev.phase, 'event');
  const repaired = R.resolveEvent({ ...ev, event: 'repair', life: 2 }, 0, NAMES, seq());
  assert.equal(repaired.life, 4);
  assert.equal(repaired.phase, 'battle');
  const vault = R.resolveEvent({ ...ev, event: 'vault' }, 0, NAMES, seq());
  assert.equal(vault.phase, 'patch');
  const fight = R.choosePatch(vault, vault.patchOffers[0], NAMES, seq());
  assert.equal(fight.phase, 'battle');
  assert.equal(fight.opp.level, R.FLOORS[1].level + 1);
  assert.ok(!fight.opp.elite, '保管庫の警報は精鋭戦ではない (パッチは増えない)');
  const shady = R.resolveEvent({ ...ev, event: 'shady', life: 1 }, 0, NAMES, seq());
  assert.equal(shady.phase, 'event', 'ライフ 1 では拾えない');
});

test('クリアすると次の HEAT が解放される', async () => {
  const R = await load();
  store.delete('compileRunHeat');
  assert.equal(R.unlockedHeat(), 0);
  const last = { ...R.newRun(NAMES, seq()), deck: NAMES.slice(0, 3), phase: 'battle', floor: R.FLOORS.length - 1, opp: { deck: ['X'], level: 3, boss: true } };
  R.finishBattle(last, true, 0, NAMES, seq());
  assert.equal(R.unlockedHeat(), 1);
  R.finishBattle({ ...last, heat: 1 }, true, 0, NAMES, seq());
  assert.equal(R.unlockedHeat(), 2);
});

test('GACHA: 勝つとクレジット (精鋭戦・無傷で多め)。3 クレジットで1回引き、かぶったらライフ +1', async () => {
  const { R, run } = await drafted();
  const won = R.finishBattle(run, true, 0, NAMES, seq());
  assert.equal(won.credits, 2, '勝ち +1・無傷 +1');
  const hurt = R.finishBattle(run, true, 1, NAMES, seq());
  assert.equal(hurt.credits, 1);
  assert.equal(R.canPull(won), false, 'まだ足りない');
  const rich = { ...won, credits: 7 };
  const once = R.gachaPull(rich, () => 0.05);                 // 5 → EPIC
  assert.equal(once.credits, 7 - R.GACHA_COST);
  assert.equal(once.lastPull.rar, 'E');
  assert.equal(R.patchInfo(once.lastPull.id).rar, 'E');
  assert.ok(once.patches.includes(once.lastPull.id));
  const again = R.gachaPull({ ...once, life: 2 }, () => 0.05);  // 同じものが出る → かぶり
  assert.equal(again.lastPull.dupe, true);
  assert.equal(again.life, 3);
  assert.equal(again.patches.length, once.patches.length);
  const lucky = { ...rich, patches: ['lucky'] };
  assert.equal(R.gachaCost(lucky), R.GACHA_COST - 1);
  assert.equal(R.gachaPull({ ...rich, phase: 'draft' }).credits, 7, '戦いの合間以外では引けない');
  const jack = R.finishBattle({ ...run, patches: ['jackpot'] }, true, 1, NAMES, seq());
  assert.equal(jack.credits, 2);
});

test('GACHA のレア度はどれにもパッチがあり、重みの合計は 100', async () => {
  const R = await load();
  for (const k of Object.keys(R.RARITY)) assert.ok(R.PATCHES.some(p => p.rar === k), k);
  assert.equal(Object.values(R.RARITY).reduce((n, r) => n + r.weight, 0), 100);
  assert.ok(R.PATCHES.every(p => R.RARITY[p.rar]));
});
