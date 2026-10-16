import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MOB_PROTO, MOB_DECK, MOB_PROTOCOL, buildMobDefs } from '../js3d/mobcards.js';
import { buildRunDefs } from '../js3d/runcards.js';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
const mob = buildMobDefs();
Engine.init(cards, effects, buildRunDefs(cards, effects).engine.concat(mob.engine));
Engine.setAiLevel(0);
Engine.setTrace(false);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const S = await import('../js3d/story.js');
const mobNodes = S.CHAPTERS.flatMap(c => c.nodes).filter(n => n.kind === 'battle' && n.opp.includes(MOB_PROTO));

test('量産プロトコル: 値 0〜5 の6枚。cards.json には無く、文と効果がそろう', () => {
  assert.ok(!cards.protocols.some(p => p.name === MOB_PROTO));
  assert.deepEqual(MOB_PROTOCOL.cards.map(c => c.value), [0, 1, 2, 3, 4, 5]);
  assert.equal(mob.engine.length, 6);
  for (const e of mob.engine) {
    const u = mob.ui.find(d => d.id === e.id);
    assert.equal(e.proto, MOB_PROTO);
    if (u.middle) assert.equal(e.eff.middle._text, u.middle, e.id);
    else assert.deepEqual(e.eff, {}, e.id);
  }
  assert.deepEqual(Engine.protos[MOB_PROTO], mob.engine.map(d => d.id));
});

test('量産プロトコル: ストーリーのモブ戦は相手 (タッグなら相方も) が3ラインとも量産で、山札は同じ6枚 x3', () => {
  assert.ok(mobNodes.length >= 3);
  for (const n of mobNodes) {
    assert.deepEqual(n.opp, MOB_DECK, n.id);
    if (n.tag) assert.deepEqual(n.tag.oppMate, MOB_DECK, n.id);
    const { state } = Engine.newGame({ seed: 3, p0: n.me, p1: n.opp, first: 0,
      ...(n.tag ? { tag: { p0: n.tag.mate, p1: n.tag.oppMate } } : {}) });
    const opp = Object.values(state.cards).filter(c => c.owner === 1);
    assert.equal(opp.length, n.tag ? 36 : 18, n.id);
    assert.ok(opp.every(c => c.def.startsWith(MOB_PROTO + '_')), n.id);
    assert.ok(!Object.values(state.cards).some(c => c.owner === 0 && c.def.startsWith(MOB_PROTO + '_')), n.id);
  }
});

test('量産プロトコル: タッグでも、名前のあるプロトコルは今までどおりチームの中で重ねられない', () => {
  assert.throws(() => Engine.newGame({ seed: 1, p0: ['FIRE', 'WATER', 'LIFE'], p1: MOB_DECK, first: 0,
    tag: { p0: ['FIRE', 'LIGHT', 'PSYCHIC'], p1: MOB_DECK } }), /同じプロトコル/);
});

test('量産プロトコル: CPU どうしで決着まで指せる (1人戦とタッグ)', () => {
  for (const n of [mobNodes.find(x => !x.tag), mobNodes.find(x => x.tag)]) {
    let res = Engine.newGame({ seed: 11, p0: n.me, p1: n.opp, first: 0, ...(n.tag ? { tag: { p0: n.tag.mate, p1: n.tag.oppMate } } : {}) });
    for (let i = 0; i < 4000 && res.state.winner === null; i++) {
      const st = res.state, q = res.requests && res.requests[0];
      res = Engine.apply(st, q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(st, q) } : Engine.ai.action(st));
      assert.ok(!res.error, res.error);
    }
    assert.notEqual(res.state.winner, null, n.id);
  }
});
