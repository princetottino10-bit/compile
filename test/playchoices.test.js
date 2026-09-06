'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('each selected card offers both faces on its protocol and only face-down elsewhere', async () => {
  const { placementChoices } = await import('../js3d/playchoices.js');
  const Engine = require('../engine.js');
  const cards = require('../data/cards.json');
  Engine.init(cards, require('../data/effects.json'));
  const protoOf = Object.fromEntries(cards.protocols.flatMap(p => p.cards.map(c => [c.id, p.name])));
  for (const seat of [0, 1]) {
    const st = Engine.newGame({ seed: 7, first: seat, p0: ['FIRE','WATER','LIFE'], p1: ['METAL','LIGHT','SPIRIT'] }).state;
    for (const uid of st.players[seat].hand) {
      const choices = placementChoices(Engine.legalActions(st), uid, seat);
      assert.equal(choices.length, 4);
      for (let line = 0; line < 3; line++) {
        const faces = choices.filter(a => a.line === line).map(a => a.faceUp).sort();
        assert.deepEqual(faces, st.players[seat].protocols[line].name === protoOf[st.cards[uid].def]
          ? [false, true] : [false]);
      }
      assert.ok(choices.every(a => a.side === seat && a.card === uid));
    }
  }
});

test('buttons preserve explicit destination and facing restrictions from the authority', async () => {
  const { placementChoices } = await import('../js3d/playchoices.js');
  const actions = [
    { type: 'play', card: 'a', line: 1, faceUp: true, side: 1 },
    { type: 'play', card: 'b', line: 2, faceUp: false }, { type: 'refresh' }
  ];
  assert.deepEqual(placementChoices(actions, 'a', 0), [actions[0]]);
  assert.deepEqual(placementChoices(actions, null, 0), []);
  assert.equal(actions[1].side, undefined);
});
