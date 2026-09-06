'use strict';
/* 移動中 (committed) のカードが、行き先ラインの積み札を画面上で覆わないこと。
   覆っていると「移動中のカードが邪魔で下のカードが選べない」状態になる。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

/* カード面の四隅を投影した外接矩形 (0..1 の画面座標) */
function screenBox(THREE, camera, slot, CARD) {
  const obj = new THREE.Object3D();
  obj.position.fromArray(slot.pos);
  obj.rotation.set(slot.rot[0], slot.rot[1], slot.rot[2]);
  obj.scale.setScalar(slot.scale || 1);
  obj.updateMatrixWorld(true);
  const xs = [], ys = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const v = new THREE.Vector3(sx * CARD.w / 2, 0, sz * CARD.h / 2);
    obj.localToWorld(v);
    v.project(camera);
    xs.push((v.x + 1) / 2); ys.push((1 - v.y) / 2);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function coveredRatio(over, under) {
  const w = Math.max(0, Math.min(over.x1, under.x1) - Math.max(over.x0, under.x0));
  const h = Math.max(0, Math.min(over.y1, under.y1) - Math.max(over.y0, under.y0));
  const area = (under.x1 - under.x0) * (under.y1 - under.y0);
  return area > 0 ? (w * h) / area : 0;
}

test('移動中のカードは、行き先ラインの積み札を画面上で覆わない', async () => {
  const THREE = await import('../vendor/three.module.js');
  const LAYOUT = await import('../js3d/layout.js');
  const { CARD, CAMERA } = await import('../js3d/theme.js');
  const me = 0;
  /* stage.js の homePose と同じ2姿勢 (横長 / 縦長) で確かめる */
  const poses = [
    { aspect: 1280 / 720, pos: CAMERA.home.pos, fov: CAMERA.fov },
    { aspect: 390 / 844, pos: [CAMERA.home.pos[0], 12.4, 5.2], fov: CAMERA.fov + 14 }
  ];
  for (const pose of poses) {
    const camera = new THREE.PerspectiveCamera(pose.fov, pose.aspect, 0.1, 120);
    camera.position.fromArray(pose.pos);
    camera.lookAt(...CAMERA.home.look);
    camera.updateMatrixWorld(true);
    for (let line = 0; line < 3; line++) {
      for (const side of [0, 1]) {
        const moving = screenBox(THREE, camera, LAYOUT.transitSlot(line, side, me), CARD);
        /* 積み札は覆うたびに持ち主側へ伸びる。どの高さでも隠してはいけない */
        /* 自分の行き先ラインだけでなく、どのラインの積み札も隠さないこと */
        for (let idx = 0; idx < 5; idx++) for (let l2 = 0; l2 < 3; l2++) for (const s2 of [0, 1]) {
          const under = screenBox(THREE, camera, LAYOUT.stackSlot(l2, s2, idx, me), CARD);
          const covered = coveredRatio(moving, under);
          assert.ok(covered < 0.2,
            `移動中(line${line} side${side}) が line${l2} side${s2} の${idx + 1}枚目を ${Math.round(covered * 100)}% 覆っている`);
        }
      }
    }
  }
});
