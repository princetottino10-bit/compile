'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('both room seats: local own-side plays round-trip to the authority on all three lanes', async () => {
  const { buildRoomState, normLegalActions, toRoomAction } = await import('../js3d/room.js');
  const Engine = require('../engine.js');
  Engine.init(require('../data/cards.json'), require('../data/effects.json'));
  for (const seat of [0, 1]) {
    const result = Engine.newGame({ seed: 7, first: seat, p0: ['FIRE', 'WATER', 'LIFE'], p1: ['METAL', 'LIGHT', 'SPIRIT'] });
    const st = result.state;
    const rm = { side: seat, legalActions: Engine.legalActions(st), game: {
      turn: seat, phase: st.phase, winner: null, control: -1,
      lines: [[[], []], [[], []], [[], []]], totals: [[0, 0], [0, 0], [0, 0]],
      protocols: st.players.map(p => p.protocols),
      counts: st.players.map(p => ({ hand: p.hand.length, deck: p.deck.length })),
      hand: st.players[seat].hand.map(uid => ({ uid, def: st.cards[uid].def })), trash: [[], []]
    }};
    const local = buildRoomState(rm);
    assert.equal(local.turn, 0);
    assert.deepEqual(local.players[0].hand, st.players[seat].hand);
    const actions = normLegalActions(rm).filter(a => a.type === 'play' && !a.faceUp);
    assert.deepEqual([...new Set(actions.map(a => a.line))].sort(), [0, 1, 2]);
    for (const action of actions) {
      assert.equal(action.side ?? local.turn, 0);
      const wire = toRoomAction(action, seat);
      const next = Engine.apply(st, wire);
      assert.ok(!next.error, next.error);
      assert.ok((next.view || next.state).lines[action.line][seat].includes(action.card));
    }
    // CORRUPTION-style actions may explicitly target the opponent's seat.
    const foreign = { type: 'play', card: 'alias', line: 2, side: 1 - seat, faceUp: true };
    const normalized = normLegalActions({ side: seat, legalActions: [foreign] })[0];
    assert.equal(normalized.side, 1);
    assert.deepEqual(toRoomAction(normalized, seat), foreign);
    assert.equal(foreign.side, 1 - seat);
  }
});

test('desktop and portrait: a raised selected card cannot intercept a legal placement pad', async () => {
  const THREE = await import('../vendor/three.module.js');
  const { placementPad } = await import('../js3d/input.js');
  const { BOARD, CARD, CAMERA } = await import('../js3d/theme.js');
  for (const aspect of [1280 / 720, 390 / 844]) {
    const camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, .1, 120);
    camera.position.fromArray(CAMERA.home.pos);
    camera.lookAt(...CAMERA.home.look);
    camera.updateMatrixWorld(true);
    const pads = [0, 1, 2].map(line => {
      const geometry = new THREE.PlaneGeometry(CARD.w * 1.34, CARD.h * 1.2);
      geometry.rotateX(-Math.PI / 2);
      const pad = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      pad.position.set(BOARD.laneX[line], .006, BOARD.stackZ[1]);
      pad.userData = { isPad: true, line, side: 0, pulse: .95 };
      pad.updateMatrixWorld(true);
      return pad;
    });
    for (const pad of pads) {
      const ndc = pad.position.clone().project(camera);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      card.position.copy(pad.position).lerp(camera.position, .3);
      card.lookAt(camera.position);
      card.userData.uid = 'selected';
      card.updateMatrixWorld(true);
      // Reproduce the old all-mesh picking path: it selects the card, not the pad.
      assert.equal(ray.intersectObjects([card, ...pads], true)[0].object, card);
      const destination = placementPad(ray, pads, 'selected', 'selected', ['selected', 'other']);
      assert.equal(destination.line, pad.userData.line);
      assert.equal(destination.side, 0);
      assert.equal(placementPad(ray, pads, 'other', 'selected', ['selected', 'other']), null);
      assert.equal(placementPad(ray, pads, null, null, ['selected']), null);
      pad.userData.pulse = 0;
      assert.equal(placementPad(ray, pads, 'selected', 'selected', ['selected']), null);
      pad.userData.pulse = .95;
      card.geometry.dispose(); card.material.dispose();
    }
    pads.forEach(pad => { pad.geometry.dispose(); pad.material.dispose(); });
  }
});
