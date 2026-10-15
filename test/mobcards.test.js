import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MOB_CARDS, MOB_DECKS, buildMobDefs, mobDeckMods } from '../js3d/mobcards.js';
import { buildRunDefs } from '../js3d/runcards.js';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
const mob = buildMobDefs(cards, effects);
Engine.init(cards, effects, buildRunDefs(cards, effects).engine.concat(mob.engine));
Engine.setAiLevel(0);
Engine.setTrace(false);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const S = await import('../js3d/story.js');

test('量産カード: 元のカードと同じプロトコル・同じ値で、文と効果の段がそろう。cards.json には無い', () => {
  const ids = new Set(cards.protocols.flatMap(p => p.cards.map(c => c.id)));
  for (const m of MOB_CARDS) {
    assert.ok(!ids.has(m.id), m.id);
    assert.ok(ids.has(m.base), m.base);
    const e = mob.engine.find(d => d.id === m.id), u = mob.ui.find(d => d.id === m.id);
    const base = cards.protocols.flatMap(p => p.cards.map(c => ({ ...c, proto: p.name }))).find(c => c.id === m.base);
    assert.equal(e.proto, base.proto);
    assert.equal(e.value, base.value);
    assert.equal(u.mark, '量産');
    for (const slot of ['upper', 'middle', 'lower']) {
      if (u[slot]) assert.equal(e.eff[slot]._text, u[slot], m.id + ' ' + slot);
      if (m[slot] === null) assert.ok(!e.eff[slot] && !u[slot], m.id + ' ' + slot + ' は外す');
    }
  }
});

test('量産カード: ストーリーの mob / tag.oppMob は MOB_DECKS にあり、相手 (と相手の味方) の山札だけが入れ替わる', () => {
  const nodes = S.CHAPTERS.flatMap(c => c.nodes).filter(n => n.mob);
  assert.ok(nodes.length >= 1);
  for (const n of nodes) {
    assert.ok(MOB_DECKS[n.mob], n.id);
    const mods = mobDeckMods(n.mob);
    const mateMods = n.tag && n.tag.oppMob ? mobDeckMods(n.tag.oppMob) : null;
    if (n.tag && n.tag.oppMob) assert.ok(mateMods, n.id + ': ' + n.tag.oppMob);
    const { state } = Engine.newGame({ seed: 3, p0: n.me, p1: n.opp, first: 0, deckMods: [{}, mods],
      ...(n.tag ? { tag: { p0: n.tag.mate, p1: n.tag.oppMate, mods: [null, mateMods] } } : {}) });
    const defs = (side, bench) => Object.values(state.cards).filter(c => c.owner === side && (bench === undefined || c.zone.startsWith('bench') === bench)).map(c => c.def);
    const check = (m, bench) => {
      for (const [from, to] of Object.entries(m.swap)) {
        assert.ok(defs(1, bench).includes(to) && !defs(1).includes(from), n.id + ': ' + from);
        assert.ok(!defs(0).includes(to));
      }
    };
    check(mods, false);
    if (mateMods) check(mateMods, true);
    assert.equal(Object.values(state.cards).filter(c => c.owner === 1).length, n.tag ? 36 : 18);
  }
});

test('量産カード: CPU どうしで決着まで指せる', () => {
  const n = S.CHAPTERS.flatMap(c => c.nodes).find(x => x.mob);
  let res = Engine.newGame({ seed: 11, p0: n.me, p1: n.opp, first: 0, deckMods: [{}, mobDeckMods(n.mob)],
    ...(n.tag ? { tag: { p0: n.tag.mate, p1: n.tag.oppMate, mods: [null, n.tag.oppMob ? mobDeckMods(n.tag.oppMob) : null] } } : {}) });
  for (let i = 0; i < 4000 && res.state.winner === null; i++) {
    const st = res.state, q = res.requests && res.requests[0];
    res = Engine.apply(st, q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(st, q) } : Engine.ai.action(st));
    assert.ok(!res.error, res.error);
  }
  assert.notEqual(res.state.winner, null);
});
