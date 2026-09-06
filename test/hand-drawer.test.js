'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('tucked hand moves away from the board and selected cards restore the open layout', async () => {
  const { VIEW } = await import('../js3d/theme.js');
  const { handSlot, handSlotRaised } = await import('../js3d/layout.js');
  const original = { k: VIEW.k, handOpen: VIEW.handOpen };
  try {
    VIEW.k = 0;
    VIEW.handOpen = true;
    const open = handSlot(2, 7);
    VIEW.handOpen = false;
    const tucked = handSlot(2, 7);
    assert.ok(tucked.pos[2] > open.pos[2], 'tucked hand is farther toward the screen edge');
    assert.ok(tucked.pos[1] < open.pos[1], 'tucked hand is lower');
    assert.ok(tucked.scale < open.scale, 'tucked cards are smaller');
    assert.ok(tucked.pos[2] - open.pos[2] < .7, 'tucked hand stays mostly visible');
    assert.ok(tucked.scale > open.scale * .9, 'tucked cards remain readable');
    const raised = handSlotRaised(2, 7);
    assert.ok(raised.pos[1] > tucked.pos[1]);
    assert.ok(raised.pos[2] < tucked.pos[2]);
  } finally {
    VIEW.k = original.k;
    VIEW.handOpen = original.handOpen;
  }
});

test('large hands split into two readable rows instead of stacking inaccessible cards', async () => {
  const { VIEW } = await import('../js3d/theme.js');
  const { handSlot } = await import('../js3d/layout.js');
  const original = { k: VIEW.k, handOpen: VIEW.handOpen };
  try {
    VIEW.k = 0; VIEW.handOpen = true;
    const slots = Array.from({ length: 12 }, (_, i) => handSlot(i, 12));
    assert.ok(slots.slice(0, 6).every(s => s.pos[1] < slots[6].pos[1]), 'back row is raised above front row');
    assert.ok(slots.slice(0, 6).every(s => s.pos[2] > slots[6].pos[2]), 'back row sits behind front row');
    for (const row of [slots.slice(0, 6), slots.slice(6)]) {
      for (let i = 1; i < row.length; i++) assert.ok(Math.abs(row[i].pos[0] - row[i - 1].pos[0]) > .7);
    }
  } finally {
    VIEW.k = original.k; VIEW.handOpen = original.handOpen;
  }
});
