'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('selection decorations do not expand the card hit area, even after deselection', async () => {
  const THREE = await import('../vendor/three.module.js');
  const { setSelected } = await import('../js3d/card.js');
  const card = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
  card.add(face);
  const ray = new THREE.Raycaster(new THREE.Vector3(.9, 5, 0), new THREE.Vector3(0, -1, 0));
  for (const on of [true, false, true]) {
    setSelected(card, on);
    card.updateMatrixWorld(true);
    assert.equal(ray.intersectObject(card, true).length, 0, `outside card, selected=${on}`);
    ray.ray.origin.x = 0;
    assert.ok(ray.intersectObject(card, true)[0].object === face, 'the physical face remains clickable');
    ray.ray.origin.x = .9;
  }
});

test('a previously selected card cannot steal a hit from its neighboring card', async () => {
  const THREE = await import('../vendor/three.module.js');
  const { setSelected } = await import('../js3d/card.js');
  const geometry = new THREE.PlaneGeometry(1, 1.4).rotateX(-Math.PI / 2);
  const cards = [0, 1.1].map(x => {
    const card = new THREE.Group();
    card.position.x = x;
    card.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    return card;
  });
  setSelected(cards[0], true);
  setSelected(cards[0], false);
  cards.forEach(card => card.updateMatrixWorld(true));
  const ray = new THREE.Raycaster(new THREE.Vector3(.9, 5, 0), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObjects(cards, true)[0].object.parent === cards[1], 'click must reach the neighboring card');
});
