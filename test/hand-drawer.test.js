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
    const raised = handSlotRaised(2, 7);
    assert.ok(raised.pos[1] > tucked.pos[1]);
    assert.ok(raised.pos[2] < tucked.pos[2]);
  } finally {
    VIEW.k = original.k;
    VIEW.handOpen = original.handOpen;
  }
});
