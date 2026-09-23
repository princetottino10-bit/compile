/* 画面上で重なったカードから、いま選べるものを拾う。
   指に追従中のカードや、選択で持ち上がった手札が真上に来ても、
   accept を通らなければ読み飛ばして下のカードへ降りる。
   accept を省略すると従来通り最前面のカード (またはパッド) を返す。 */
function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function pickCard(ray, objects, accept) {
  const hits = ray.intersectObjects(objects, true);
  for (const hit of hits) {
    let obj = hit.object;
    while (obj && !obj.userData.uid && !obj.userData.isPad) obj = obj.parent;
    if (!obj) continue;
    if (!shown(obj)) continue;                 // 隠した手札など、見えていない札はタップを奪わない
    if (accept && !accept(obj.userData)) continue;
    return { obj, point: hit.point };
  }
  return null;
}

/* Test placement pads independently of cards that can cover them on screen. */
export function placementPad(ray, pads, hitUid, selectedUid, hand) {
  if (!selectedUid) return null;
  // Tapping another hand card must still allow changing the selection.
  if (hitUid && hitUid !== selectedUid && hand.includes(hitUid)) return null;
  const hit = ray.intersectObjects(pads.filter(pad => pad.userData.pulse > 0), false)[0];
  return hit ? hit.object.userData : null;
}
