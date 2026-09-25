/* 勝ち抜き戦 (run.js): ドラフト → はじめのパッチ → 地図を登る (戦闘・精鋭・イベント・休憩所・ショップ・宝箱) → BOSS。
   ライフはコンパイルされた回数だけ減る。パッチ・ビルド・カード除去・ガチャ・HEAT */
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

/* ドラフト → はじめのパッチ (指定が無ければ取らない) → 地図 */
async function started(patch) {
  const R = await load();
  let run = R.newRun(NAMES, seq());
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  run = R.choosePatch(run, null, NAMES, seq());
  if (patch) run = { ...run, patches: [].concat(patch) };
  return { R, run };
}
/* いまの段から、指定した種類のマスへ (無ければ地図を作り直した体で置き換える) */
function goTo(R, run, type) {
  const id = R.reachable(run)[0];
  const node = R.nodeById(run, id);
  const map = { rows: run.map.rows.map(row => row.map(n => (n.id === id ? { ...n, type } : n))) };
  return R.chooseNode({ ...run, map }, node.id, NAMES, seq());
}

test('3回選ぶとデッキができ、はじめのパッチを3つから選んで地図へ', async () => {
  const R = await load();
  let run = R.newRun(NAMES, seq());
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  assert.equal(run.deck.length, 3);
  assert.equal(new Set(run.deck).size, 3);
  assert.equal(run.phase, 'patch');
  assert.equal(run.patchOffers.length, 3);
  assert.ok(run.patchOffers.every(id => R.patchInfo(id).rar !== 'L'), 'LEGENDARY ははじめに出ない');
  const got = R.choosePatch(run, run.patchOffers[1], NAMES, seq());
  assert.deepEqual(got.patches, [run.patchOffers[1]]);
  assert.equal(got.phase, 'map');
  assert.equal(got.life, R.RUN_LIFE);
  assert.equal(got.credits, R.START_CREDITS);
  let hot = R.newRun(NAMES, seq(), 5);
  for (let k = 0; k < 3; k++) hot = R.draftPick(hot, hot.offers[0], NAMES, seq());
  assert.equal(hot.phase, 'map', 'HEAT 5 ははじめのパッチ無し');
  assert.equal(hot.maxLife, R.RUN_LIFE - 1, 'HEAT 1 以上はライフ −1');
});

test('地図: 12段、0段目は戦闘・5段目は宝箱・10段目は休憩所・最上段は BOSS。どのマスにも下から道があり、BOSS まで登れる', async () => {
  const R = await load();
  for (let s = 0; s < 30; s++) {
    let x = s + 1;
    const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    const map = R.makeMap(rnd);
    assert.equal(map.rows.length, R.MAP_ROWS);
    assert.ok(map.rows[0].every(n => n.type === 'battle'));
    assert.ok(map.rows[5].every(n => n.type === 'treasure'));
    assert.ok(map.rows[R.MAP_ROWS - 2].every(n => n.type === 'rest'));
    assert.deepEqual(map.rows[R.MAP_ROWS - 1].map(n => n.type), ['boss']);
    assert.ok(map.rows[1].concat(map.rows[2]).every(n => n.type !== 'elite' && n.type !== 'rest'), '序盤に精鋭・休憩所は出ない');
    for (let r = 1; r < R.MAP_ROWS; r++) {
      for (const n of map.rows[r]) assert.ok(map.rows[r - 1].some(p => p.next.includes(n.id)), n.id + ' に下から道がある');
    }
    for (let r = 0; r < R.MAP_ROWS - 1; r++) for (const n of map.rows[r]) assert.ok(n.next.length >= 1, n.id + ' から上へ道がある');
  }
});

test('進めるのはつながっているマスだけ。戦闘で勝つとクレジットと報酬、負けたら同じ相手とやり直し', async () => {
  const { R, run } = await started();
  const far = run.map.rows[3][0].id;
  assert.equal(R.chooseNode(run, far, NAMES, seq()), run, '飛ばして進めない');
  const b = R.chooseNode(run, R.reachable(run)[0], NAMES, seq());
  assert.equal(b.phase, 'battle');
  assert.equal(b.opp.level, 1);
  assert.ok(b.opp.deck.every(n => !b.deck.includes(n)));
  const lost = R.finishBattle(b, false, 2, NAMES, seq());
  assert.equal(lost.life, R.RUN_LIFE - 2);
  assert.equal(lost.phase, 'battle');
  assert.deepEqual(lost.opp, b.opp, 'やり直しは同じ相手');
  const won = R.finishBattle(lost, true, 1, NAMES, seq());
  assert.equal(won.phase, 'reward');
  assert.equal(won.credits, R.START_CREDITS + 3);
  assert.equal(won.offers.length, 3);
  const swapped = R.applyReward(won, { type: 'swap', add: won.offers[0], remove: won.deck[1] }, NAMES, seq());
  assert.ok(swapped.deck.includes(won.offers[0]));
  assert.equal(swapped.phase, 'map');
  assert.deepEqual(R.reachable(swapped), R.nodeById(swapped, swapped.pos).next);
});

test('精鋭: 相手が強く、勝つとクレジット多めとパッチ。上の段の精鋭は挑戦者', async () => {
  const { R, run } = await started();
  const e = goTo(R, run, 'elite');
  assert.ok(e.opp.elite);
  assert.equal(e.opp.level, 2);
  const won = R.finishBattle(e, true, 0, NAMES, seq());
  assert.equal(won.credits, R.START_CREDITS + 6, '精鋭 +5・無傷 +1');
  const after = R.applyReward(won, { type: 'skip' }, NAMES, seq());
  assert.equal(after.phase, 'patch');
  assert.equal(R.choosePatch(after, after.patchOffers[0], NAMES, seq()).phase, 'map');
  const high = R.prepareBattle({ ...run, pos: run.map.rows[7][0].id }, NAMES, seq(), 'elite');
  assert.ok(high.opp.level >= 5, '上の段の精鋭は挑戦者');
});

test('BOSS を倒すとクリアで、次の HEAT が解放される。ライフが尽きたら終わり', async () => {
  const { R, run } = await started();
  store.delete('compileRunHeat');
  const boss = R.prepareBattle({ ...run, pos: run.map.rows[R.MAP_ROWS - 1][0].id }, NAMES, seq());
  assert.ok(boss.opp.boss);
  const clear = R.finishBattle(boss, true, 1, NAMES, seq());
  assert.equal(clear.phase, 'clear');
  assert.equal(R.loadBest().reached, R.MAP_ROWS + 1);
  assert.equal(R.unlockedHeat(), 1);
  const over = R.finishBattle(boss, false, 99, NAMES, seq());
  assert.equal(over.phase, 'over');
  assert.equal(over.life, 0);
});

test('休憩所: 休む (回復) か 研ぐ (カード除去)。除去したカードは試合の山札から抜ける', async () => {
  const { R, run } = await started();
  const rest = goTo(R, { ...run, life: 2 }, 'rest');
  assert.equal(rest.phase, 'rest');
  assert.equal(R.restHeal(rest).life, 4);
  const rm = R.restRemove(rest);
  assert.equal(rm.phase, 'remove');
  const card = rm.deck[0] + '_2';
  const done = R.removeCard(rm, card);
  assert.deepEqual(done.removed, [card]);
  assert.equal(done.phase, 'map');
  assert.equal(R.removeCard(rm, 'NOPE_1'), rm, 'デッキに無いカードは外せない');
  assert.deepEqual(R.battleOpts(done, 0).exclude, [[card], []]);
  /* プロトコルを入れ替えたら、そのプロトコルの除去は取り消し */
  const reward = { ...done, phase: 'reward', offers: ['DEATH'], pendingPatch: false };
  const swapped = R.applyReward(reward, { type: 'swap', add: 'DEATH', remove: done.deck[0] }, NAMES, seq());
  assert.deepEqual(swapped.removed, []);
});

test('ショップ: パッチを買う・カード除去 (買うたびに値上がり、やめたら返金)・修理 (1回)', async () => {
  const { R, run } = await started();
  const shop = goTo(R, { ...run, credits: 30, life: 3 }, 'shop');
  assert.equal(shop.phase, 'shop');
  assert.equal(shop.shop.patches.length, 3);
  const id = shop.shop.patches[0];
  const bought = R.buyPatch(shop, id);
  assert.ok(bought.patches.includes(id));
  assert.equal(bought.credits, 30 - R.patchPrice(shop, id));
  assert.equal(R.buyPatch(bought, id), bought, '売り切れ');
  const rm = R.buyRemove(bought);
  assert.equal(rm.phase, 'remove');
  const back = R.cancelRemove(rm);
  assert.equal(back.credits, bought.credits, 'やめたら返金');
  assert.equal(back.removeCost, bought.removeCost);
  const rm2 = R.removeCard(R.buyRemove(back), back.deck[1] + '_1');
  assert.equal(rm2.phase, 'shop');
  assert.equal(rm2.removeCost, 7);
  const healed = R.buyHeal(rm2);
  assert.equal(healed.life, 5);
  const hurt = { ...healed, life: 3 };
  assert.equal(R.buyHeal(hurt), hurt, '修理は1回だけ');
  assert.equal(R.leaveShop(healed).phase, 'map');
});

test('宝箱・イベント: 宝箱はパッチ、祭壇は呪いの試合、保管庫は警報の試合、デバッガーはカード除去', async () => {
  const { R, run } = await started();
  const t = goTo(R, run, 'treasure');
  assert.equal(t.phase, 'patch');
  assert.equal(R.choosePatch(t, t.patchOffers[0], NAMES, seq()).phase, 'map');
  const ev = goTo(R, run, 'event');
  assert.equal(ev.phase, 'event');
  const altar = R.resolveEvent({ ...ev, event: 'altar' }, 0, NAMES, seq());
  assert.equal(altar.phase, 'battle');
  assert.equal(altar.route, 'cursed');
  assert.deepEqual(R.battleOpts(altar, 0).handSize, [4, 7]);
  const cursedWin = R.finishBattle(altar, true, 1, NAMES, () => 0.9);
  assert.equal(cursedWin.cursedWin, true);
  assert.ok(['R', 'E', 'L'].includes(cursedWin.lastPull.rar), '呪いに勝つと RARE 以上確定');
  const vault = R.resolveEvent({ ...ev, event: 'vault' }, 0, NAMES, seq());
  assert.equal(vault.phase, 'patch');
  const fight = R.choosePatch(vault, vault.patchOffers[0], NAMES, seq());
  assert.equal(fight.phase, 'battle');
  assert.equal(fight.opp.level, 2);
  assert.ok(!fight.opp.elite);
  const purge = R.resolveEvent({ ...ev, event: 'purge' }, 0, NAMES, seq());
  assert.equal(purge.phase, 'remove');
  assert.equal(purge.life, R.RUN_LIFE - 1);
  const repair = R.resolveEvent({ ...ev, event: 'repair', life: 2 }, 0, NAMES, seq());
  assert.equal(repair.life, 4);
  assert.equal(repair.phase, 'map');
  assert.equal(R.resolveEvent({ ...ev, event: 'shady', life: 1 }, 0, NAMES, seq()).phase, 'event', 'ライフ 1 では拾えない');
});

test('パッチ: FIREWALL・FAILSAFE・PHOENIX・SELF REPAIR・CLEAN SWEEP・MIDAS', async () => {
  const { R, run } = await started();
  const b = goTo(R, run, 'battle');
  const fw = { ...b, patches: ['firewall'] };
  assert.equal(R.damageOf(fw, 3), 2);
  assert.equal(R.damageOf(fw, 0), 0);
  const fs = { ...b, patches: ['failsafe'] };
  assert.equal(R.lethal(fs, 99), false);
  const saved = R.finishBattle(fs, false, 99, NAMES, seq());
  assert.equal(saved.life, 1);
  assert.equal(saved.failsafeUsed, true);
  assert.equal(R.lethal(saved, 1), true, '2回目は耐えない');
  const ph = R.finishBattle({ ...b, patches: ['phoenix'], life: 2 }, false, 9, NAMES, seq());
  assert.equal(ph.life, ph.maxLife, 'PHOENIX は全回復');
  assert.equal(R.finishBattle({ ...b, patches: ['repair'], life: 3 }, true, 1, NAMES, seq()).life, 3);
  assert.equal(R.finishBattle({ ...b, patches: ['sweep'], life: 2 }, true, 0, NAMES, seq()).life, 4);
  assert.equal(R.finishBattle({ ...b, patches: ['midas'] }, true, 0, NAMES, seq()).credits, R.START_CREDITS + 8, '(3 + 無傷 1) × 2');
});

test('パッチとビルド: 試合のはじめ方 (手札・先攻・コントロール)', async () => {
  const R = await load();
  const base = { patches: [], route: 'normal' };
  assert.deepEqual(R.battleOpts(base, 0), { winCompiles: R.RUN_WIN_COMPILES, handSize: [5, 5] });
  assert.deepEqual(R.battleOpts({ ...base, patches: ['cache'] }, 0).handSize, [6, 5]);
  assert.deepEqual(R.battleOpts({ ...base, patches: ['cache', 'jammer'] }, 0).handSize, [6, 3], 'HAND 2つ: 相手 さらに −1');
  assert.deepEqual(R.battleOpts({ ...base, patches: ['cache', 'buffer', 'jammer'] }, 0).handSize, [7, 3], 'HAND 3つ: 自分 +1 (上限 7)');
  const tempo = R.battleOpts({ ...base, patches: ['repair', 'sweep', 'initiative'] }, 0);
  assert.equal(tempo.first, 0);
  assert.equal(tempo.startControl, 0);
  assert.deepEqual(R.battleOpts({ ...base, patches: ['overflow', 'singularity'], route: 'cursed' }, 0).handSize, [4, 7], '呪いはパッチより強い');
  for (const t of Object.keys(R.TAGS)) assert.ok(R.PATCHES.filter(p => p.tag === t && !p.gachaOnly).length >= 3, t + ' は ガチャ無しでも3つそろう');
  assert.ok(R.PATCHES.every(p => R.TAGS[p.tag] && R.RARITY[p.rar]));
});

test('GUARD を2つそろえると最大ライフ +1。GREED 2つで勝つとクレジット +2', async () => {
  const { R, run } = await started();
  let x = { ...run, phase: 'patch', after: 'map', patchOffers: ['firewall'], life: 3 };
  x = R.choosePatch(x, 'firewall', NAMES, seq());
  x = R.choosePatch({ ...x, phase: 'patch', after: 'map', patchOffers: ['failsafe'] }, 'failsafe', NAMES, seq());
  assert.equal(x.maxLife, R.RUN_LIFE + 1);
  assert.equal(x.life, 4);
  const b = goTo(R, { ...run, patches: ['lucky', 'search'] }, 'battle');
  assert.equal(R.finishBattle(b, true, 1, NAMES, seq()).credits, R.START_CREDITS + 5);
});

test('GACHA: 戦いの合間に引ける。レア度と「かぶり」', async () => {
  const { R, run } = await started();
  assert.equal(R.canPull(run), true, 'はじめのクレジットで1回引ける');
  const rich = { ...run, credits: 20 };
  const leg = R.gachaPull(rich, () => 0.01);
  assert.equal(leg.lastPull.rar, 'L');
  assert.equal(leg.credits, 20 - R.GACHA_COST);
  const epic = R.gachaPull(rich, () => 0.05);
  assert.equal(epic.lastPull.rar, 'E');
  const again = R.gachaPull({ ...epic, life: 2 }, () => 0.05);
  assert.equal(again.lastPull.dupe, true);
  assert.equal(again.life, 3);
  assert.equal(R.gachaCost({ ...rich, patches: ['lucky'] }), R.GACHA_COST - 1);
  const fighting = { ...rich, phase: 'battle' };
  assert.equal(R.gachaPull(fighting), fighting, '戦う前の画面では引けない');
  assert.equal(Object.values(R.RARITY).reduce((n, r) => n + r.weight, 0), 100);
});

test('相手のコンパイル回数を記録から数える (リコンパイル・効果で済ませたものも)', async () => {
  const R = await load();
  const st = { actionLog: ['P2: ライン1をコンパイル', 'P2: FIRE をコンパイル！', 'P1: ライン2をコンパイル',
    'P2: ライン1をコンパイル', 'P2: リコンパイル — 相手のデッキトップを獲得', 'P2: DIVERSITY をコンパイル完了にした！'] };
  assert.equal(R.compilesBy(st, 1), 3);
  assert.equal(R.compilesBy(st, 0), 1);
});

test('地図になる前の保存 (v1) は読まない', async () => {
  const R = await load();
  store.set('compileRun', JSON.stringify({ v: 1, phase: 'battle', floor: 3 }));
  assert.equal(R.loadRun(), null);
});
