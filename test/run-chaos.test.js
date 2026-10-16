/* カオス勝ち抜き戦 (run.js の mode: 'chaos' と run-chaos.js): 異変・Ω の祭壇・ルーレット・ふつうとの行き来 */
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = () => import('../js3d/run.js');
const NAMES = ['FIRE', 'WATER', 'SPEED', 'DARKNESS', 'HATE', 'SMOKE', 'LIFE', 'LIGHT', 'PLAGUE', 'METAL', 'LOVE', 'DEATH', 'TIME', 'WAR'];
const seq = (k = 0.37) => { let i = 0; return () => ((i++ * k) % 1); };

async function chaosOnMap() {
  const R = await load();
  let run = R.newRun(NAMES, seq(), 3, 'chaos');
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  run = R.choosePatch(run, null, NAMES, seq());
  return { R, run };
}

test('カオス: HEAT は無く、ライフ 12・クレジット 12。ドラフトのあとパッチを2つもらい、RARE 以上から選ぶ', async () => {
  const R = await load();
  let run = R.newRun(NAMES, seq(), 3, 'chaos');
  assert.equal(run.mode, 'chaos');
  assert.equal(run.heat, 0);
  assert.equal(run.life, 12);
  assert.equal(run.credits, 12);
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  assert.equal(run.phase, 'patch');
  assert.equal(run.patches.length, 2);
  assert.deepEqual(run.gifted, run.patches);
  for (const id of run.patchOffers) assert.notEqual(R.patchInfo(id).rar, 'C');
});

test('カオス: 試合ごとに異変がかかり、group が同じものは重ならない', async () => {
  const { MUTATORS, rollMutators, mutatorCount } = await import('../js3d/run-chaos.js');
  assert.equal(mutatorCount(0, 'battle'), 1);
  assert.equal(mutatorCount(6, 'battle'), 2);
  assert.equal(mutatorCount(6, 'elite'), 3);
  assert.equal(mutatorCount(11, 'boss'), 3);
  for (let s = 1; s < 40; s++) {
    const ids = rollMutators(3, seq(s / 41), {});
    assert.equal(ids.length, 3);
    const groups = ids.map(id => MUTATORS.find(m => m.id === id).group).filter(Boolean);
    assert.equal(new Set(groups).size, groups.length);
    assert.ok(!rollMutators(3, seq(s / 41), { boss: true }).some(id => ['mirror', 'swap', 'giant'].includes(id)));
  }
  const { R, run } = await chaosOnMap();
  const b = R.chooseNode(run, R.reachable(run)[0], NAMES, seq());
  assert.equal(b.phase, 'battle');
  assert.equal(R.mutatorsOf(b).length, 1);
});

test('カオス: 異変が試合のはじめ方を変える (手札・値・強化・Ω・一発勝負・入れ替わり)', async () => {
  const { R, run } = await chaosOnMap();
  const b = R.chooseNode(run, R.reachable(run)[0], NAMES, seq());
  const withMut = (ids) => ({ ...b, opp: { ...b.opp, deck: ['DEATH', 'TIME', 'WAR'], chaos: ids } });
  assert.deepEqual(R.battleOpts(withMut(['bighand']), 0).handSize, [7, 7]);
  assert.deepEqual(R.battleOpts(withMut(['famine']), 1).handSize, [3, 3]);
  const up = R.battleOpts(withMut(['upside']), 0).perks;
  assert.equal(up[0].faceDownValue, 4); assert.equal(up[1].faceUpMinus, 1);
  const pw = R.battleOpts(withMut(['powerup']), 0).deckMods;
  assert.equal(pw[1].swap.DEATH_1, 'DEATH_1_UP');
  assert.equal(pw[0].swap[b.deck[0] + '_2'], b.deck[0] + '_2_UP');
  const om = R.battleOpts(withMut(['omega']), 0).deckMods;
  assert.ok(om[1].add.includes('XO_4') && om[1].add.includes('XO_5') && om[1].add.includes('XO_3') && om[1].add.includes('X_DEATH'));
  const sd = R.battleOpts(withMut(['sudden']), 0);
  assert.deepEqual(sd.startCompiled, [2, 2]);
  const hc = R.battleOpts(withMut(['handicap']), 0);
  assert.equal(hc.first, 1); assert.equal(hc.startControl, 1);
  assert.deepEqual(R.fightDecks(withMut(['swap'])), { me: ['DEATH', 'TIME', 'WAR'], ai: b.deck });
  /* 異変の無い試合は今までどおり */
  assert.ok(!R.battleOpts(withMut([]), 0).perks);
});

test('カオス: 一攫千金・巨人狩り・吸血がクレジットとライフに効く', async () => {
  const { R, run } = await chaosOnMap();
  const b = R.chooseNode(run, R.reachable(run)[0], NAMES, seq());
  const plain = R.creditGain({ ...b, patches: [], opp: { ...b.opp, chaos: [] } }, 1);
  assert.equal(R.creditGain({ ...b, patches: [], opp: { ...b.opp, chaos: ['jackpot'] } }, 1), plain + 10);
  assert.equal(R.creditGain({ ...b, patches: [], opp: { ...b.opp, chaos: ['giant'] } }, 1), plain * 3);
  const lose = R.finishBattle({ ...b, patches: [], life: 10, opp: { ...b.opp, chaos: ['jackpot'] } }, false, 1, NAMES, seq());
  assert.equal(lose.life, 7);
  const win = R.finishBattle({ ...b, patches: [], life: 5, opp: { ...b.opp, chaos: ['vampire'] } }, true, 1, NAMES, seq());
  assert.equal(win.life, 6);
  assert.deepEqual(win.history[win.history.length - 1].chaos, ['vampire']);
  assert.equal(win.cardOffers[win.cardOffers.length - 1].type, 'gamble');
});

test('カオス: Ω を手に入れると、プロトコルが無ければ入れ替わり、試合の山札に入る。Ω は強化できない', async () => {
  const { R, run } = await chaosOnMap();
  const got = R.gainOmegaFor({ ...run, deck: ['FIRE', 'HATE', 'SMOKE'] }, seq());
  const id = got.added[0];
  assert.ok(/^XO_/.test(id));
  assert.ok(got.deck.includes(R.protoOfCard(id)));
  assert.equal(got.gotOmega, id);
  const b = R.chooseNode({ ...got, phase: 'map' }, R.reachable(got)[0], NAMES, seq());
  assert.ok(R.battleOpts({ ...b, opp: { ...b.opp, chaos: [] } }, 0).deckMods[0].add.includes(id));
  const u = R.upgradeCard({ ...got, phase: 'upgrade', after: 'map' }, id);
  assert.ok(!(u.upgrades || []).includes(id));
});

test('カオス: ルーレットはライフを 0 にしない。結果を lastRoulette に残す', async () => {
  const { R, run } = await chaosOnMap();
  let r = { ...run, life: 2 };
  for (let s = 1; s < 60; s++) {
    r = R.spinRouletteFor(r, seq(s / 61), NAMES);
    assert.ok(r.life >= 1);
    assert.equal(r.deck.length, 3);
  }
  assert.ok(r.lastRoulette.length >= 1);
});

test('ふつうの勝ち抜き戦とカオスは、別々に途中を持てる (switchRun)', async () => {
  const R = await load();
  store.clear();
  let normal = R.newRun(NAMES, seq(), 0);
  R.saveRun({ ...normal, phase: 'map' });
  const c = R.switchRun('chaos');
  assert.equal(c, null);
  assert.ok(R.activeRunOf('normal'));
  R.saveRun({ ...R.newRun(NAMES, seq(), 0, 'chaos'), phase: 'map' });
  assert.equal(R.loadRun().mode, 'chaos');
  const back = R.switchRun('normal');
  assert.ok(back && !back.mode);
  assert.equal(R.activeRunOf('chaos').mode, 'chaos');
  assert.equal(R.switchRun('chaos').mode, 'chaos');
  assert.ok(R.activeRunOf('normal'));
});

test('カオスのイベントはふつうの勝ち抜き戦には出ない', async () => {
  const R = await load();
  let run = R.newRun(NAMES, seq(), 0);
  for (let k = 0; k < 3; k++) run = R.draftPick(run, run.offers[0], NAMES, seq());
  run = R.choosePatch(run, null, NAMES, seq());
  for (let s = 1; s < 50; s++) {
    const id = R.reachable(run)[0];
    const map = { rows: run.map.rows.map(row => row.map(n => (n.id === id ? { ...n, type: 'event' } : n))) };
    const e = R.chooseNode({ ...run, map }, id, NAMES, seq(s / 51));
    assert.ok(!R.EVENTS[e.event].chaos);
  }
});

test('カオス: 異変「長期戦」「二重の山札」「赤ちゃん」', async () => {
  const { R, run } = await chaosOnMap();
  const b = R.chooseNode(run, R.reachable(run)[0], NAMES, seq());
  const withMut = (ids) => ({ ...b, opp: { ...b.opp, deck: ['DEATH', 'TIME', 'WAR'], chaos: ids } });
  const m = R.battleOpts(withMut(['marathon']), 0);
  assert.deepEqual(m.startCompiled, [0, 0]);
  assert.equal(m.winCompiles, 3);
  const t1 = R.battleOpts(withMut(['twin']), 0), t2 = R.battleOpts(withMut(['twin']), 0);
  assert.equal(t1.deckMods[1].add.length, 12);
  assert.deepEqual(t1.deckMods, t2.deckMods);                 // 同じ試合なら同じ写し (読み直しても変わらない)
  assert.ok(t1.deckMods[1].add.every(id => /^(DEATH|TIME|WAR)_\d$/.test(id)));
  assert.deepEqual(R.battleOpts(withMut(['baby']), 0).handSize, [2, 7]);
});

test('カオス: コピー機で写しが山札に入る。プロトコルを入れ替えると写しも消える', async () => {
  const { R, run } = await chaosOnMap();
  const id = run.deck[0] + '_3';
  const c = R.copyCard({ ...run, phase: 'copy' }, id);
  assert.deepEqual(c.copies, [id]);
  assert.equal(c.phase, 'map');
  const b = R.chooseNode(c, R.reachable(c)[0], NAMES, seq());
  assert.ok(R.battleOpts({ ...b, opp: { ...b.opp, chaos: [] } }, 0).deckMods[0].add.includes(id));
  const up = R.battleOpts({ ...b, upgrades: [id], opp: { ...b.opp, chaos: [] } }, 0);
  assert.ok(up.deckMods[0].add.includes(id + '_UP'));
  const sw = R.applyReward({ ...c, phase: 'reward', offers: ['DEATH'] }, { type: 'swap', add: 'DEATH', remove: c.deck[0] }, NAMES, seq());
  assert.deepEqual(sw.copies, []);
});

test('カオス: カジノは当たれば増え、外れれば減る', async () => {
  const { R, run } = await chaosOnMap();
  const ev = R.EVENTS.casino;
  const r0 = { ...run, credits: 10, phase: 'event', event: 'casino' };
  const win = R.resolveEvent(r0, 0, NAMES, () => 0.1);
  assert.equal(win.credits, 15);
  const lose = R.resolveEvent(r0, 1, NAMES, () => 0.9);
  assert.equal(lose.credits, 0);
  assert.ok(ev.chaos);
});

test('カオス: 酔っぱらいは CPU のでたらめの割合を上げる', async () => {
  const { R, run } = await chaosOnMap();
  const b = R.chooseNode(run, R.reachable(run)[0], NAMES, seq());
  assert.equal(R.runAiBlunder({ ...b, opp: { ...b.opp, chaos: ['drunk'] } }), R.DRUNK_BLUNDER);
  assert.equal(R.runAiBlunder({ ...b, opp: { ...b.opp, chaos: [] } }), 0);
  assert.equal(R.runAiBlunder(null), 0);
});

test('カオス: ボスを倒すと LOOP。ボスの Ω を奪い、ライフ全回復で新しい地図、異変が1つ増える', async () => {
  const { R, run } = await chaosOnMap();
  const top = run.map.rows[R.MAP_ROWS - 1][0];
  const atBoss = { ...run, boss: 'abyss', life: 3, pos: top.id, phase: 'battle', route: 'normal',
    opp: { deck: ['DARKNESS', 'DEATH', 'PLAGUE'], level: 3, boss: true, bossId: 'abyss', chaos: [] } };
  const clear = R.finishBattle(atBoss, true, 1, NAMES, seq());
  assert.equal(clear.phase, 'clear');
  assert.ok(R.canLoop(clear));
  const next = R.nextLoop(clear, seq());
  assert.equal(next.loop, 1);
  assert.equal(next.phase, 'map');
  assert.equal(next.life, next.maxLife);
  assert.equal(next.pos, null);
  assert.notEqual(next.boss, 'abyss');
  assert.ok(next.added.includes('XO_4'));
  assert.ok(next.deck.includes('DEATH'));
  assert.equal(next.stolen, 'XO_4');
  const b = R.chooseNode(next, R.reachable(next)[0], NAMES, seq());
  assert.equal(R.mutatorsOf(b).length, 2);
  /* ふつうの勝ち抜き戦には LOOP は無い */
  assert.ok(!R.canLoop({ ...clear, mode: undefined }));
});
