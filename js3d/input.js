/* Test placement pads independently of cards that can cover them on screen. */
export function placementPad(ray, pads, hitUid, selectedUid, hand) {
  if (!selectedUid) return null;
  // Tapping another hand card must still allow changing the selection.
  if (hitUid && hitUid !== selectedUid && hand.includes(hitUid)) return null;
  const hit = ray.intersectObjects(pads.filter(pad => pad.userData.pulse > 0), false)[0];
  return hit ? hit.object.userData : null;
}
