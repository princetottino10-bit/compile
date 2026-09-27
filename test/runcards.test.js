import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildRunDefs, STAR_CARDS, UP, upgradeOf, baseOf, isStar } from '../js3d/runcards.js';
import { battleOpts } from '../js3d/run.js';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
const defs = buildRunDefs(cards, effects);
Engine.init(cards, effects, defs.engine);
Engine.setAiLevel(1);

test('勝ち抜き戦のカード: ★ は各プロトコルに1枚、＋ は値 +1 (値 6 は強化できない)', () => {
  const ids = new Set(defs.engine.map(d => d.id));
  for (const s of STAR_CARDS) assert.ok(ids.has(s.id) && ids.has(s.id + UP), s.id);
  const fire1 = defs.engine.find(d => d.id === 'FIRE_1' + UP);
  const base = cards.protocols.find(p => p.name === 'FIRE').cards.find(c => c.id === 'FIRE_1');
  assert.equal(fire1.value, base.value + 1);
  for (const p of cards.protocols) for (const c of p.cards) assert.equal(ids.has(c.id + UP), c.value < 6, c.id);
  assert.equal(upgradeOf('FIRE_1'), 'FIRE_1' + UP);
  assert.equal(upgradeOf('FIRE_1' + UP), null);
  assert.equal(baseOf('X_FIRE' + UP), 'X_FIRE');
  assert.ok(isStar('X_FIRE' + UP) && !isStar('FIRE_1'));
  /* 画面の定義には印 (＋ / ★) と、元の絵の番号がある */
  const ui = Object.fromEntries(defs.ui.map(d => [d.id, d]));
  assert.equal(ui['FIRE_1' + UP].mark, '＋');
  assert.equal(ui.X_FIRE.mark, '★');
  assert.ok(ui.X_FIRE.number >= 1 && ui.X_FIRE.middle);
});

test('勝ち抜き戦の試合の組み方: 強化したカードは ＋ 版に替わり、★ は山札に足される', () => {
  const run = { deck: ['FIRE', 'WATER', 'SPEED'], patches: [], removed: ['WATER_1'], upgrades: ['FIRE_2', 'X_FIRE'], added: ['X_FIRE', 'X_SPEED'] };
  const o = battleOpts(run, 0);
  assert.deepEqual(o.deckMods[0].swap, { FIRE_2: 'FIRE_2' + UP });
  assert.deepEqual(o.deckMods[0].add, ['X_FIRE' + UP, 'X_SPEED']);
  const st = Engine.newGame({ seed: 5, p0: run.deck, p1: ['DEATH', 'METAL', 'LIFE'], exclude: o.exclude, deckMods: o.deckMods }).state;
  const mine = Object.values(st.cards).filter(c => c.owner === 0).map(c => c.def);
  assert.equal(mine.length, 18 - 1 + 2);
  assert.ok(mine.includes('FIRE_2' + UP) && !mine.includes('FIRE_2'));
  assert.ok(mine.includes('X_FIRE' + UP) && mine.includes('X_SPEED') && !mine.includes('WATER_1'));
  /* デッキに無いプロトコルの ★ は足さない */
  const st2 = Engine.newGame({ seed: 5, p0: run.deck, p1: ['DEATH', 'METAL', 'LIFE'], deckMods: [{ add: ['X_DEATH'] }, {}] }).state;
  assert.equal(Object.values(st2.cards).filter(c => c.owner === 0).length, 18);
});

test('勝ち抜き戦のカード: ★ と ＋ を入れたデッキで、CPU どうし最後まで遊べる', () => {
  const allStars = STAR_CARDS.map(s => s.id);
  const pairs = [[['FIRE', 'WATER', 'SPEED'], ['PSYCHIC', 'LIGHT', 'DARKNESS']], [['GRAVITY', 'PLAGUE', 'HATE'], ['LOVE', 'LIFE', 'DEATH']]];
  for (const [p0, p1] of pairs) {
    for (const seed of [3]) {
      const mods = [p0, p1].map(ps => {
        const stars = allStars.filter(id => ps.includes(STAR_CARDS.find(s => s.id === id).proto));
        const swap = {};
        for (const p of cards.protocols.filter(x => ps.includes(x.name))) for (const c of p.cards.slice(0, 3)) if (c.value < 6) swap[c.id] = c.id + UP;
        return { swap, add: stars.concat(stars.map(id => id + UP)) };
      });
      let res = Engine.newGame({ seed, p0, p1, winCompiles: 2, deckMods: mods });
      for (let i = 0; i < 3000 && res.state.winner === null; i++) {
        const q = res.requests[0];
        const a = q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) } : Engine.ai.action(res.state);
        res = Engine.apply(res.state, a);
        assert.equal(res.error, null, p0.join('/') + ' seed ' + seed + ' step ' + i);
      }
      assert.notEqual(res.state.winner, null, p0.join('/') + ' seed ' + seed + ' で決着しない');
    }
  }
});
